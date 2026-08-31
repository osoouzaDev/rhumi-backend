import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export const notFoundHandler: RequestHandler = (request, response) => {
    response.status(404).json({
        error: {
            code: "ROUTE_NOT_FOUND",
            message: `Rota ${request.method} ${request.path} não encontrada.`,
            requestId: request.requestId,
        },
    });
};

const safeErrorForLog = (error: unknown): Record<string, unknown> => {
    if (!(error instanceof Error)) return { type: typeof error };
    const errorWithCode = error as Error & { code?: unknown; constraint?: unknown };
    return {
        name: error.name,
        message: error.message,
        ...(typeof errorWithCode.code === "string" ? { code: errorWithCode.code } : {}),
        ...(typeof errorWithCode.constraint === "string"
            ? { constraint: errorWithCode.constraint } : {}),
        ...(env.NODE_ENV !== "production" ? { stack: error.stack } : {}),
    };
};

export const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
) => {
    if (error instanceof ZodError) {
        response.status(422).json({
            error: {
                code: "VALIDATION_ERROR",
                message: "Os dados enviados são inválidos.",
                details: error.flatten(),
                requestId: request.requestId,
            },
        });
        return;
    }

    if (error instanceof AppError) {
        response.status(error.statusCode).json({
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
                requestId: request.requestId,
            },
        });
        return;
    }

    console.error("Erro não tratado na API:", {
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        error: safeErrorForLog(error),
    });

    response.status(500).json({
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "Ocorreu um erro interno no servidor.",
            requestId: request.requestId,
        },
    });
};
