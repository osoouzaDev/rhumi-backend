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
import type { LoginInput } from "../schemas/auth.schemas.js";
import {
    createAccessToken,
    createRefreshToken,
    hashRefreshToken,
} from "../utils/auth-tokens.js";
import { mfaService, type MfaChallengeResult } from "./mfa.service.js";

export interface AuthenticationResult {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: {
        id: string;
        employeeId: string;
        companyId: string;
        employeeCode: string;
        fullName: string;
        email: string;
    };
}

const invalidCredentials = (): AppError => new AppError(
    401,
    "INVALID_CREDENTIALS",
    "CÃ³digo, e-mail ou senha invÃ¡lidos.",
);

const timingSafePasswordHash = argon2.hash(
    "RHumi timing equalizer for invalid authentication attempts",
    { type: argon2.argon2id },
);

const publicUser = (user: AuthenticationUser): AuthenticationResult["user"] => ({
    id: user.id,
    employeeId: user.employeeId,
    companyId: user.companyId,
    employeeCode: user.employeeCode,
    fullName: user.fullName,
    email: user.email,
});

export class AuthService {
    async login(
        input: LoginInput,
        metadata: SessionMetadata,
    ): Promise<AuthenticationResult | MfaChallengeResult> {
        const companyId = await authTenantRepository.resolveLoginCompany(input.identifier);
        const user = companyId
            ? await runWithTenantContext(
                companyId,
                () => authRepository.findUserByIdentifier(input.identifier),
            )
            : null;
        const passwordHash = user?.passwordHash ?? await timingSafePasswordHash;
        const passwordMatches = await argon2.verify(passwordHash, input.password);
        const canAuthenticate = user ? this.canAuthenticate(user) : false;

        if (!user || !canAuthenticate || !passwordMatches) {
            if (user && canAuthenticate && !passwordMatches) {
                await runWithTenantContext(
                    user.companyId,
                    () => authRepository.recordFailedLogin(
                        user.id,
                        env.LOGIN_MAX_ATTEMPTS,
                        env.LOGIN_LOCK_MINUTES,
                    ),
                );
            }
            throw invalidCredentials();
        }

        return runWithTenantContext(user.companyId, async () => {
            await authRepository.recordSuccessfulLogin(user.id);
            if (await mfaService.isEnabledForUser(user.id)) {
                return mfaService.createLoginChallenge(user, metadata);
            }

            const refreshToken = createRefreshToken();
            const sessionId = await authRepository.createSession(
                user.id,
                hashRefreshToken(refreshToken),
                this.createRefreshExpiration(),
                metadata,
                env.AUTH_MAX_ACTIVE_SESSIONS,
            );

            return {
                accessToken: createAccessToken(user.id, sessionId, user.companyId),
                refreshToken,
                expiresIn: env.ACCESS_TOKEN_EXPIRES_IN_SECONDS,
                user: publicUser(user),
            };
        });
    }

    async refresh(
        refreshToken: string | undefined,
        metadata: SessionMetadata,
    ): Promise<AuthenticationResult> {
        if (!refreshToken) {
            throw new AppError(401, "REFRESH_TOKEN_REQUIRED", "Refresh token nÃ£o informado.");
        }

        const currentRefreshTokenHash = hashRefreshToken(refreshToken);
        const companyId = await authTenantRepository.resolveRefreshCompany(
            currentRefreshTokenHash,
        );
        if (!companyId) {
            throw this.invalidRefreshToken();
        }

        return runWithTenantContext(companyId, async () => {
            const newRefreshToken = createRefreshToken();
            const rotatedSession = await authRepository.rotateSession(
                currentRefreshTokenHash,
                hashRefreshToken(newRefreshToken),
                this.createRefreshExpiration(),
                metadata,
                env.AUTH_MAX_ACTIVE_SESSIONS,
            );

            if (!rotatedSession || rotatedSession.user.companyId !== companyId) {
                throw this.invalidRefreshToken();
            }

            return {
                accessToken: createAccessToken(
                    rotatedSession.user.id,
                    rotatedSession.sessionId,
                    rotatedSession.user.companyId,
                ),
                refreshToken: newRefreshToken,
                expiresIn: env.ACCESS_TOKEN_EXPIRES_IN_SECONDS,
                user: publicUser(rotatedSession.user),
            };
        });
    }

    async logout(context: AuthenticationContext): Promise<void> {
        await authRepository.revokeSession(context.sessionId, context.userId, "logout");
    }

    async logoutAll(context: AuthenticationContext): Promise<void> {
        await authRepository.revokeAllSessions(context.userId, "logout_all");
    }

    private invalidRefreshToken(): AppError {
        return new AppError(
            401,
            "INVALID_REFRESH_TOKEN",
            "A sessÃ£o nÃ£o Ã© vÃ¡lida, expirou ou teve reutilizaÃ§Ã£o detectada.",
        );
    }

    private canAuthenticate(user: AuthenticationUser): boolean {
        return user.status === "active"
            && user.employeeStatus === "active"
            && user.companyActive
            && (!user.lockedUntil || user.lockedUntil <= new Date());
    }

    private createRefreshExpiration(): Date {
        return new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 86_400_000);
    }
}

export const authService = new AuthService();
