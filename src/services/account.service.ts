import argon2 from "argon2";
import { env } from "../config/env.js";
import { runWithTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import {
    accountRepository,
    type AccountRecipient,
    type AccountSession,
    type AccountTokenPurpose,
} from "../repositories/account.repository.js";
import { authRepository, type AuthenticationContext } from "../repositories/auth.repository.js";
import { authTenantRepository } from "../repositories/auth-tenant.repository.js";
import type { AuditActor } from "../repositories/organization.repository.js";
import type {
    ActivateAccountInput,
    ChangePasswordInput,
    ForgotPasswordInput,
    ResetPasswordInput,
} from "../schemas/auth.schemas.js";
import { createOpaqueToken, hashOpaqueToken } from "../utils/auth-tokens.js";

interface RequestMetadata {
    ipAddress?: string;
}

export interface AccountTokenDelivery {
    accepted: true;
    expiresAt?: Date;
    token?: string;
}

const tokenSubject = (purpose: AccountTokenPurpose): string => ({
    activation: "Ative sua conta RHumi",
    password_reset: "Redefina sua senha RHumi",
    email_verification: "Confirme seu e-mail RHumi",
})[purpose];

const tokenPath = (purpose: AccountTokenPurpose): string => ({
    activation: "/activate-account",
    password_reset: "/reset-password",
    email_verification: "/verify-email",
})[purpose];

const invalidToken = (): AppError => new AppError(
    400,
    "INVALID_OR_EXPIRED_ACCOUNT_TOKEN",
    "O token informado é inválido, expirou ou já foi utilizado.",
);

export class AccountService {
    async issueInvitation(
        context: AuthenticationContext,
        userId: string,
        actor: AuditActor,
        metadata: RequestMetadata = {},
    ): Promise<AccountTokenDelivery> {
        const recipient = await accountRepository.findRecipient(userId);
        if (!recipient || recipient.companyId !== context.companyId) {
            throw new AppError(404, "USER_NOT_FOUND", "Conta de acesso não encontrada.");
        }
        return this.issueToken(
            recipient,
            "activation",
            env.ACCOUNT_ACTIVATION_EXPIRES_IN_HOURS * 3_600_000,
            actor.userId,
            metadata,
        );
    }

    async requestPasswordReset(
        input: ForgotPasswordInput,
        metadata: RequestMetadata,
    ): Promise<AccountTokenDelivery> {
        const companyId = await authTenantRepository.resolveLoginCompany(input.identifier);
        if (!companyId) {
            return { accepted: true };
        }

        return runWithTenantContext(companyId, async () => {
            const user = await authRepository.findUserByIdentifier(input.identifier);
            if (!user || user.status === "inactive" || !user.companyActive) {
                return { accepted: true };
            }
            const recipient = await accountRepository.findRecipient(user.id);
            if (!recipient) {
                return { accepted: true };
            }
            const purpose: AccountTokenPurpose = recipient.activatedAt
                ? "password_reset"
                : "activation";
            const duration = purpose === "activation"
                ? env.ACCOUNT_ACTIVATION_EXPIRES_IN_HOURS * 3_600_000
                : env.PASSWORD_RESET_EXPIRES_IN_MINUTES * 60_000;
            return this.issueToken(recipient, purpose, duration, undefined, metadata);
        });
    }

    async activate(input: ActivateAccountInput): Promise<void> {
        await this.consumePasswordToken(input.token, "activation", input.password);
    }

    async resetPassword(input: ResetPasswordInput): Promise<void> {
        await this.consumePasswordToken(input.token, "password_reset", input.newPassword);
    }

    async requestEmailVerification(
        context: AuthenticationContext,
        metadata: RequestMetadata,
    ): Promise<AccountTokenDelivery> {
        const recipient = await accountRepository.findRecipient(context.userId);
        if (!recipient || recipient.companyId !== context.companyId) {
            throw new AppError(404, "USER_NOT_FOUND", "Conta de acesso não encontrada.");
        }
        if (recipient.emailVerifiedAt) {
            return { accepted: true };
        }
        return this.issueToken(
            recipient,
            "email_verification",
            env.EMAIL_VERIFICATION_EXPIRES_IN_HOURS * 3_600_000,
            context.userId,
            metadata,
        );
    }

    async verifyEmail(token: string): Promise<void> {
        const tokenHash = hashOpaqueToken(token);
        const companyId = await authTenantRepository.resolveAccountTokenCompany(tokenHash);
        if (!companyId) {
            throw invalidToken();
        }
        const consumed = await runWithTenantContext(
            companyId,
            () => accountRepository.consumeToken(tokenHash, "email_verification"),
        );
        if (!consumed) {
            throw invalidToken();
        }
    }

    async changePassword(
        context: AuthenticationContext,
        input: ChangePasswordInput,
    ): Promise<void> {
        const recipient = await accountRepository.findRecipient(context.userId);
        if (!recipient || recipient.companyId !== context.companyId) {
            throw new AppError(404, "USER_NOT_FOUND", "Conta de acesso não encontrada.");
        }
        const matches = await argon2.verify(recipient.passwordHash, input.currentPassword);
        if (!matches) {
            throw new AppError(401, "INVALID_CURRENT_PASSWORD", "A senha atual está incorreta.");
        }
        const passwordHash = await argon2.hash(input.newPassword, { type: argon2.argon2id });
        await accountRepository.changePassword(context.userId, context.sessionId, passwordHash);
    }

    listSessions(context: AuthenticationContext): Promise<AccountSession[]> {
        return accountRepository.listSessions(context.userId, context.sessionId);
    }

    async revokeSession(context: AuthenticationContext, sessionId: string): Promise<void> {
        const revoked = await accountRepository.revokeOwnedSession(context.userId, sessionId);
        if (!revoked) {
            throw new AppError(404, "SESSION_NOT_FOUND", "Sessão ativa não encontrada.");
        }
    }

    private async consumePasswordToken(
        rawToken: string,
        purpose: "activation" | "password_reset",
        password: string,
    ): Promise<void> {
        const tokenHash = hashOpaqueToken(rawToken);
        const companyId = await authTenantRepository.resolveAccountTokenCompany(tokenHash);
        if (!companyId) {
            throw invalidToken();
        }
        const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
        const consumed = await runWithTenantContext(
            companyId,
            () => accountRepository.consumeToken(tokenHash, purpose, passwordHash),
        );
        if (!consumed) {
            throw invalidToken();
        }
    }

    private async issueToken(
        recipient: AccountRecipient,
        purpose: AccountTokenPurpose,
        durationMs: number,
        createdByUserId: string | undefined,
        metadata: RequestMetadata,
    ): Promise<AccountTokenDelivery> {
        const token = createOpaqueToken();
        const expiresAt = new Date(Date.now() + durationMs);
        const actionUrl = new URL(tokenPath(purpose), env.PUBLIC_APP_URL);
        actionUrl.searchParams.set("token", token);
        await accountRepository.issueToken({
            companyId: recipient.companyId,
            userId: recipient.userId,
            purpose,
            tokenHash: hashOpaqueToken(token),
            rawToken: token,
            actionUrl: actionUrl.toString(),
            expiresAt,
            createdByUserId,
            requestIp: metadata.ipAddress,
            recipient: recipient.email,
            fullName: recipient.fullName,
            subject: tokenSubject(purpose),
        });
        return {
            accepted: true,
            expiresAt,
            token: env.ACCOUNT_TOKENS_EXPOSE_IN_RESPONSE ? token : undefined,
        };
    }
}

export const accountService = new AccountService();
