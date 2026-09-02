import { createHash, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { checkRedisHealth } from "../config/redis.js";
import { checkDatabaseHealth } from "../database/connection.js";
import { metricsService } from "../services/metrics.service.js";

const matchesSecret = (received: string | undefined, expected: string): boolean => {
    if (!received) return false;
    const receivedHash = createHash("sha256").update(received).digest();
    const expectedHash = createHash("sha256").update(expected).digest();
    return timingSafeEqual(receivedHash, expectedHash);
};

export const liveness = (_request: Request, response: Response): void => {
    response.json({ status: "alive" });
};

export const readiness = async (_request: Request, response: Response): Promise<void> => {
    try {
        const [, redis] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);
        response.json({
            status: "ready",
            dependencies: { database: "up", redis },
        });
    } catch {
        response.status(503).json({
            status: "not_ready",
            dependencies: { database: "unavailable_or_degraded" },
        });
    }
};

export const metrics = (request: Request, response: Response): void => {
    if (!env.METRICS_ENABLED) {
        response.status(404).json({ error: { code: "METRICS_DISABLED" } });
        return;
    }
    const bearer = request.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
    const received = request.get("x-metrics-token") ?? bearer;
    if (!env.METRICS_TOKEN || !matchesSecret(received, env.METRICS_TOKEN)) {
        response.status(401).json({ error: { code: "METRICS_AUTHENTICATION_REQUIRED" } });
        return;
    }
    response.type("text/plain; version=0.0.4").send(metricsService.render());
};
