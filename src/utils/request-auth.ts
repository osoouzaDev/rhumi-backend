import type { Request } from "express";
import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import type { AuditActor } from "../repositories/organization.repository.js";

export const requireAuthenticationContext = (request: Request): AuthenticationContext => {
    if (!request.auth) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória.");
    }
    return request.auth;
};

export const getAuditActor = (request: Request): AuditActor => ({
    userId: requireAuthenticationContext(request).userId,
    requestId: request.requestId,
});
