import type { NextFunction, Request, Response } from "express";
import { metricsService, normalizeMetricRoute } from "../services/metrics.service.js";
import { logger } from "../utils/logger.js";

export const observeRequest = (
    request: Request,
    response: Response,
    next: NextFunction,
): void => {
    const started = process.hrtime.bigint();
    response.once("finish", () => {
        const durationSeconds = Number(process.hrtime.bigint() - started) / 1_000_000_000;
        const matchedRoute = request.route?.path;
        const route = normalizeMetricRoute(
            typeof matchedRoute === "string"
                ? `${request.baseUrl}${matchedRoute}`
                : request.path,
        );
        metricsService.recordHttp(request.method, route, response.statusCode, durationSeconds);
        const fields = {
            requestId: request.requestId,
            method: request.method,
            route,
            status: response.statusCode,
            durationMs: Math.round(durationSeconds * 1_000),
            companyId: request.auth?.companyId,
            userId: request.auth?.userId,
        };
        if (response.statusCode >= 500) logger.error("http.request", fields);
        else if (response.statusCode >= 400) logger.warn("http.request", fields);
        else logger.info("http.request", fields);
    });
    next();
};
