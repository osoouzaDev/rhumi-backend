import type { Request, Response } from "express";
import { runWithTenantContext } from "../database/tenant-context.js";
import { notificationsService } from "../services/notifications.service.js";
import { requireAuthenticationContext } from "../utils/request-auth.js";

const writeEvent = (response: Response, event: string, data: unknown): void => {
    response.write(`event: ${event}\n`);
    response.write(`data: ${JSON.stringify(data)}\n\n`);
};

export const streamNotifications = (request: Request, response: Response): void => {
    const context = requireAuthenticationContext(request);
    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders();
    writeEvent(response, "connected", { connectedAt: new Date().toISOString() });

    let closed = false;
    const publishSummary = async (): Promise<void> => {
        if (closed) return;
        try {
            const summary = await runWithTenantContext(
                context.companyId,
                () => notificationsService.getSummary(context),
            );
            writeEvent(response, "notification-summary", summary);
        } catch {
            writeEvent(response, "heartbeat", { at: new Date().toISOString() });
        }
    };
    void publishSummary();
    const interval = setInterval(() => void publishSummary(), 15_000);

    request.on("close", () => {
        closed = true;
        clearInterval(interval);
    });
};
