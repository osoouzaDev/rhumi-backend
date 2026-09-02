import type { NextFunction, Request, RequestHandler, Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { corsOrigins, env } from "../config/env.js";
import { createRateLimitStore } from "../config/redis.js";
import { AppError } from "../errors/app-error.js";
import { readCookie } from "../utils/cookies.js";

const rateLimitHandler = (
    request: Request,
    response: Response,
): void => {
    response.status(429).json({
        error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Muitas requisições foram realizadas. Tente novamente mais tarde.",
            requestId: request.requestId,
        },
    });
};

export const securityHeaders = helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    strictTransportSecurity: env.NODE_ENV === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
});

export const globalRateLimiter = rateLimit({
    store: createRateLimitStore("global"),
    windowMs: env.GLOBAL_RATE_LIMIT_WINDOW_MS,
    limit: env.GLOBAL_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (request) => request.path === "/health",
    handler: rateLimitHandler,
});

export const loginRateLimiter = rateLimit({
    store: createRateLimitStore("login"),
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
});

export const refreshRateLimiter = rateLimit({
    store: createRateLimitStore("refresh"),
    windowMs: env.REFRESH_RATE_LIMIT_WINDOW_MS,
    limit: env.REFRESH_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
});

export const mfaRateLimiter = rateLimit({
    store: createRateLimitStore("mfa"),
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
});

export const accountRecoveryRateLimiter = rateLimit({
    store: createRateLimitStore("account-recovery"),
    windowMs: env.ACCOUNT_RECOVERY_RATE_LIMIT_WINDOW_MS,
    limit: env.ACCOUNT_RECOVERY_RATE_LIMIT_MAX,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
});

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export const enforceTrustedOrigin = (
    request: Request,
    _response: Response,
    next: NextFunction,
): void => {
    if (safeMethods.has(request.method)) {
        next();
        return;
    }

    const origin = request.header("origin")?.trim();
    if (origin && !corsOrigins.includes(origin)) {
        next(new AppError(
            403,
            "UNTRUSTED_REQUEST_ORIGIN",
            "A origem da requisição não é permitida.",
        ));
        return;
    }

    const usesBearerToken = /^Bearer\s+\S+$/i.test(
        request.header("authorization")?.trim() ?? "",
    );
    const usesAuthenticationCookie = Boolean(
        readCookie(request, env.ACCESS_TOKEN_COOKIE_NAME)
        || readCookie(request, env.REFRESH_TOKEN_COOKIE_NAME),
    );
    if (usesAuthenticationCookie && !usesBearerToken && !origin) {
        next(new AppError(
            403,
            "REQUEST_ORIGIN_REQUIRED",
            "Requisições autenticadas por cookie precisam informar uma origem confiável.",
        ));
        return;
    }

    next();
};

export const requireHttps: RequestHandler = (request, _response, next) => {
    if (env.FORCE_HTTPS && !request.secure) {
        next(new AppError(
            426,
            "HTTPS_REQUIRED",
            "Esta API aceita somente conexões HTTPS.",
        ));
        return;
    }
    next();
};

export const preventSensitiveCaching: RequestHandler = (
    _request,
    response,
    next,
) => {
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    next();
};
