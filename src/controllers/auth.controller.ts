import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";
import { loginSchema, refreshSessionSchema } from "../schemas/auth.schemas.js";
import { authService } from "../services/auth.service.js";
import {
    authenticationPayload,
    clearAuthenticationCookies,
    setAuthenticationCookies,
} from "../utils/auth-response.js";
import { readCookie } from "../utils/cookies.js";

export const sessionMetadata = (request: Request) => ({
    ipAddress: request.ip,
    userAgent: request.header("user-agent"),
});

export const login = async (request: Request, response: Response): Promise<void> => {
    const input = loginSchema.parse(request.body);
    const authentication = await authService.login(input, sessionMetadata(request));
    if ("mfaRequired" in authentication) {
        response.status(202).json({ data: authentication });
        return;
    }

    setAuthenticationCookies(response, authentication);
    response.json({ data: authenticationPayload(authentication) });
};

export const refresh = async (request: Request, response: Response): Promise<void> => {
    const input = refreshSessionSchema.parse(request.body ?? {});
    const refreshToken = input.refreshToken
        ?? readCookie(request, env.REFRESH_TOKEN_COOKIE_NAME);
    const authentication = await authService.refresh(refreshToken, sessionMetadata(request));
    setAuthenticationCookies(response, authentication);
    response.json({ data: authenticationPayload(authentication) });
};

export const logout = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória.");
    }
    await authService.logout(request.auth);
    clearAuthenticationCookies(response);
    response.status(204).send();
};

export const logoutAll = async (request: Request, response: Response): Promise<void> => {
    if (!request.auth) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória.");
    }
    await authService.logoutAll(request.auth);
    clearAuthenticationCookies(response);
    response.status(204).send();
};

export const me = (request: Request, response: Response): void => {
    if (!request.auth) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória.");
    }

    response.json({
        data: {
            user: {
                id: request.auth.userId,
                employeeId: request.auth.employeeId,
                companyId: request.auth.companyId,
                departmentId: request.auth.departmentId,
                positionId: request.auth.positionId,
                employeeCode: request.auth.employeeCode,
                fullName: request.auth.fullName,
                email: request.auth.email,
                roles: request.auth.roles,
                permissions: request.auth.permissions,
            },
        },
    });
};
