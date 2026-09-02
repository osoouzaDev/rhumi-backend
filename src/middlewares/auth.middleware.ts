import type { NextFunction, Request, RequestHandler, Response } from "express";
import { env } from "../config/env.js";
import { runWithTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import { authRepository } from "../repositories/auth.repository.js";
import { verifyAccessToken, type AccessTokenClaims } from "../utils/auth-tokens.js";
import { readCookie } from "../utils/cookies.js";

const extractAccessToken = (request: Request): string | undefined => {
    const authorization = request.headers.authorization?.trim();
    const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);

    if (bearerMatch?.[1]) {
        return bearerMatch[1].trim();
    }

    return readCookie(request, env.ACCESS_TOKEN_COOKIE_NAME);
};

const parseAccessToken = (token: string): AccessTokenClaims => {
    try {
        return verifyAccessToken(token);
    } catch {
        throw new AppError(
            401,
            "INVALID_ACCESS_TOKEN",
            "Token de acesso inválido ou expirado.",
        );
    }
};

const allowsMfaEnrollment = (request: Request): boolean => (
    (request.method === "GET" && ["/mfa", "/me"].includes(request.path))
    || (request.method === "POST"
        && ["/mfa/setup", "/mfa/confirm", "/logout"].includes(request.path))
);

export const authenticate = async (
    request: Request,
    _response: Response,
    next: NextFunction,
): Promise<void> => {
    try {
        const token = extractAccessToken(request);
        if (!token) {
            throw new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória.");
        }

        const claims = parseAccessToken(token);
        await runWithTenantContext(claims.companyId, async () => {
            const context = await authRepository.findAuthenticationContext(
                claims.sessionId,
                claims.userId,
            );

            if (!context || context.companyId !== claims.companyId) {
                throw new AppError(
                    401,
                    "INVALID_SESSION",
                    "A sessão não é válida ou expirou.",
                );
            }

            if (
                env.MFA_REQUIRE_ADMINISTRATORS
                && context.roles.some((role) => role.toLowerCase() === "administrator")
                && !context.mfaEnabled
                && !allowsMfaEnrollment(request)
            ) {
                throw new AppError(
                    403,
                    "MFA_ENROLLMENT_REQUIRED",
                    "Configure a autentica��o de dois fatores para continuar.",
                );
            }

            request.auth = context;
            next();
        });
    } catch (error) {
        next(error);
    }
};

export const authorize = (...requiredPermissions: string[]): RequestHandler => (
    request,
    _response,
    next,
) => {
    if (!request.auth) {
        next(new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória."));
        return;
    }

    const missingPermissions = requiredPermissions.filter(
        (permission) => !request.auth?.permissions.includes(permission),
    );

    if (missingPermissions.length > 0) {
        next(new AppError(
            403,
            "INSUFFICIENT_PERMISSION",
            "Você não possui permissão para executar esta operação.",
            { missingPermissions },
        ));
        return;
    }

    next();
};

export const autenticarToken = authenticate;
