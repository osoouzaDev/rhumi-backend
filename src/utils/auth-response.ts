import type { Response } from "express";
import { env, useSecureCookies } from "../config/env.js";
import type { AuthenticationResult } from "../services/auth.service.js";

const cookieOptions = {
    httpOnly: true,
    secure: useSecureCookies,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
} as const;

export const setAuthenticationCookies = (
    response: Response,
    authentication: AuthenticationResult,
): void => {
    if (!env.AUTH_COOKIES_ENABLED) return;

    response.cookie(env.ACCESS_TOKEN_COOKIE_NAME, authentication.accessToken, {
        ...cookieOptions,
        maxAge: env.ACCESS_TOKEN_EXPIRES_IN_SECONDS * 1_000,
        path: "/",
    });
    response.cookie(env.REFRESH_TOKEN_COOKIE_NAME, authentication.refreshToken, {
        ...cookieOptions,
        maxAge: env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 86_400_000,
        path: "/api/v1/auth",
    });
};

export const clearAuthenticationCookies = (response: Response): void => {
    if (!env.AUTH_COOKIES_ENABLED) return;

    response.clearCookie(env.ACCESS_TOKEN_COOKIE_NAME, {
        ...cookieOptions,
        path: "/",
    });
    response.clearCookie(env.REFRESH_TOKEN_COOKIE_NAME, {
        ...cookieOptions,
        path: "/api/v1/auth",
    });
};

export const authenticationPayload = (authentication: AuthenticationResult) => (
    env.AUTH_EXPOSE_TOKENS_IN_BODY
        ? authentication
        : {
            expiresIn: authentication.expiresIn,
            user: authentication.user,
        }
);

