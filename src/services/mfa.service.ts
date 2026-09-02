import argon2 from "argon2";
import { env } from "../config/env.js";
import { runWithTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { authTenantRepository } from "../repositories/auth-tenant.repository.js";
import {
    authRepository,
    type AuthenticationContext,
    type AuthenticationUser,
    type SessionMetadata,
} from "../repositories/auth.repository.js";
import { mfaRepository, type MfaSettings } from "../repositories/mfa.repository.js";
import type {
    DisableMfaInput,
    VerifyMfaLoginInput,
} from "../schemas/auth.schemas.js";
import {
    createAccessToken,
    createRefreshToken,
    hashRefreshToken,
} from "../utils/auth-tokens.js";
import {
    createMfaChallenge,
    createMfaEnrollmentUri,
    decryptMfaSecret,
    encryptMfaSecret,
    generateMfaSecret,
    generateRecoveryCodes,
    hashMfaChallenge,
    hashRecoveryCode,
    isTotpCode,
    verifyTotpCode,
} from "../utils/mfa.js";

export interface MfaChallengeResult {
    mfaRequired: true;
    challengeToken: string;
    expiresIn: number;
}

export interface MfaAuthenticationResult {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    mfaEnrollmentRequired: boolean;
    user: {
        id: string;
        employeeId: string;
        companyId: string;
        employeeCode: string;
        fullName: string;
        email: string;
        emailVerified: boolean;
    };
}

export class MfaService {
    async isEnabledForUser(userId: string): Promise<boolean> {
        if (!env.MFA_ENABLED) return false;
        const settings = await mfaRepository.findSettings(userId);
        return Boolean(settings?.enabled && settings.secretEncrypted);
    }

    async createLoginChallenge(
        user: AuthenticationUser,
        metadata: SessionMetadata,
    ): Promise<MfaChallengeResult> {
        this.assertMfaAvailable();
        const challengeToken = createMfaChallenge();
        await mfaRepository.createLoginChallenge(
            user.id,
            user.companyId,
            hashMfaChallenge(challengeToken),
            new Date(
                Date.now() + env.MFA_CHALLENGE_EXPIRES_IN_SECONDS * 1_000,
            ),
            metadata,
        );
        return {
            mfaRequired: true,
            challengeToken,
            expiresIn: env.MFA_CHALLENGE_EXPIRES_IN_SECONDS,
        };
    }

    async verifyLogin(
        input: VerifyMfaLoginInput,
        metadata: SessionMetadata,
    ): Promise<MfaAuthenticationResult> {
        this.assertMfaAvailable();
        const challengeHash = hashMfaChallenge(input.challengeToken);
        const companyId = await authTenantRepository.resolveMfaChallengeCompany(
            challengeHash,
        );
        if (!companyId) throw this.invalidMfaChallenge();

        return runWithTenantContext(companyId, async () => {
            const challenge = await mfaRepository.findLoginChallenge(
                challengeHash,
                env.MFA_MAX_ATTEMPTS,
            );
            if (!challenge || challenge.companyId !== companyId) {
                throw this.invalidMfaChallenge();
            }

            const verification = this.verifyCode(
                {
                    enabled: true,
                    secretEncrypted: challenge.secretEncrypted,
                    pendingSecretEncrypted: null,
                    recoveryCodeHashes: challenge.recoveryCodeHashes,
                    verifiedAt: null,
                    lastTotpCounter: challenge.lastTotpCounter,
                },
                challenge.email,
                input.code,
            );
            if (!verification.valid) {
                await mfaRepository.recordFailedChallenge(challenge.id);
                throw this.invalidMfaCode();
            }

            const consumed = await mfaRepository.consumeChallenge(
                challenge,
                verification.recoveryCodeHash,
                verification.totpCounter,
            );
            if (!consumed) throw this.invalidMfaChallenge();

            const refreshToken = createRefreshToken();
            const sessionId = await authRepository.createSession(
                challenge.userId,
                hashRefreshToken(refreshToken),
                new Date(
                    Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 86_400_000,
                ),
                metadata,
                env.AUTH_MAX_ACTIVE_SESSIONS,
            );
            return {
                accessToken: createAccessToken(
                    challenge.userId,
                    sessionId,
                    challenge.companyId,
                ),
                refreshToken,
                expiresIn: env.ACCESS_TOKEN_EXPIRES_IN_SECONDS,
                mfaEnrollmentRequired: false,
                user: {
                    id: challenge.userId,
                    employeeId: challenge.employeeId,
                    companyId: challenge.companyId,
                    employeeCode: challenge.employeeCode,
                    fullName: challenge.fullName,
                    email: challenge.email,
                    emailVerified: true,
                },
            };
        });
    }

    async status(context: AuthenticationContext): Promise<{
        enabled: boolean;
        verifiedAt: Date | null;
        recoveryCodesRemaining: number;
    }> {
        this.assertMfaAvailable();
        const settings = await mfaRepository.findSettings(context.userId);
        return {
            enabled: settings?.enabled ?? false,
            verifiedAt: settings?.verifiedAt ?? null,
            recoveryCodesRemaining: settings?.recoveryCodeHashes.length ?? 0,
        };
    }

    async beginSetup(context: AuthenticationContext): Promise<{
        manualKey: string;
        otpauthUri: string;
    }> {
        this.assertMfaAvailable();
        const secret = generateMfaSecret();
        await mfaRepository.beginSetup(context, encryptMfaSecret(secret));
        return {
            manualKey: secret,
            otpauthUri: createMfaEnrollmentUri(secret, context.email),
        };
    }

    async confirmSetup(
        context: AuthenticationContext,
        code: string,
    ): Promise<{ recoveryCodes: string[] }> {
        this.assertMfaAvailable();
        const settings = await mfaRepository.findSettings(context.userId);
        if (!settings?.pendingSecretEncrypted) {
            throw new AppError(
                409,
                "MFA_SETUP_NOT_STARTED",
                "Inicie a configuração do MFA antes de confirmá-la.",
            );
        }
        const secret = decryptMfaSecret(settings.pendingSecretEncrypted);
        const totpCounter = verifyTotpCode(secret, context.email, code);
        if (totpCounter === null) {
            throw this.invalidMfaCode();
        }

        const recoveryCodes = generateRecoveryCodes(env.MFA_RECOVERY_CODE_COUNT);
        const confirmed = await mfaRepository.confirmSetup(
            context,
            recoveryCodes.map(hashRecoveryCode),
            totpCounter,
        );
        if (!confirmed) {
            throw new AppError(
                409,
                "MFA_SETUP_NOT_STARTED",
                "A configuração pendente do MFA não foi encontrada.",
            );
        }
        return { recoveryCodes };
    }

    async disable(
        context: AuthenticationContext,
        input: DisableMfaInput,
    ): Promise<void> {
        this.assertMfaAvailable();
        const [settings, passwordHash] = await Promise.all([
            mfaRepository.findSettings(context.userId),
            mfaRepository.findPasswordHash(context.userId),
        ]);
        if (!settings?.enabled || !settings.secretEncrypted) {
            throw new AppError(409, "MFA_NOT_ENABLED", "O MFA não está habilitado.");
        }
        if (!passwordHash || !await argon2.verify(passwordHash, input.password)) {
            throw new AppError(
                401,
                "INVALID_CREDENTIALS",
                "A senha ou o código MFA é inválido.",
            );
        }
        const verification = this.verifyCode(settings, context.email, input.code);
        if (!verification.valid) throw this.invalidMfaCode();

        if (!await mfaRepository.disable(context)) {
            throw new AppError(409, "MFA_NOT_ENABLED", "O MFA não está habilitado.");
        }
    }

    private verifyCode(
        settings: MfaSettings,
        accountName: string,
        code: string,
    ): {
        valid: boolean;
        recoveryCodeHash?: string;
        totpCounter?: number;
    } {
        if (!settings.secretEncrypted) return { valid: false };
        if (isTotpCode(code)) {
            const totpCounter = verifyTotpCode(
                decryptMfaSecret(settings.secretEncrypted),
                accountName,
                code,
            );
            const unused = totpCounter !== null && (
                settings.lastTotpCounter === null
                || totpCounter > settings.lastTotpCounter
            );
            return unused
                ? { valid: true, totpCounter }
                : { valid: false };
        }

        const recoveryCodeHash = hashRecoveryCode(code);
        return settings.recoveryCodeHashes.includes(recoveryCodeHash)
            ? { valid: true, recoveryCodeHash }
            : { valid: false };
    }

    private assertMfaAvailable(): void {
        if (!env.MFA_ENABLED) {
            throw new AppError(
                503,
                "MFA_NOT_CONFIGURED",
                "O MFA não está disponível neste ambiente.",
            );
        }
    }

    private invalidMfaCode(): AppError {
        return new AppError(
            401,
            "INVALID_MFA_CODE",
            "O código de autenticação multifator é inválido.",
        );
    }

    private invalidMfaChallenge(): AppError {
        return new AppError(
            401,
            "INVALID_MFA_CHALLENGE",
            "O desafio MFA é inválido ou expirou.",
        );
    }
}

export const mfaService = new MfaService();
