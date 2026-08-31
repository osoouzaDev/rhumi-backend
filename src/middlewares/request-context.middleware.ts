import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const attachRequestContext = (
    request: Request,
    response: Response,
    next: NextFunction,
): void => {
    const receivedRequestId = request.header("x-request-id")?.trim();
    const requestId = receivedRequestId && uuidPattern.test(receivedRequestId)
        ? receivedRequestId
        : randomUUID();

    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
};

