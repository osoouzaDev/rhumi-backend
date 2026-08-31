import type { RequestHandler } from "express";
import { AppError } from "../errors/app-error.js";

export const authorizeAny = (...acceptedPermissions: string[]): RequestHandler => (
    request,
    _response,
    next,
) => {
    if (!request.auth) {
        next(new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória."));
        return;
    }

    const hasPermission = acceptedPermissions.some(
        (permission) => request.auth?.permissions.includes(permission),
    );
    if (!hasPermission) {
        next(new AppError(
            403,
            "INSUFFICIENT_PERMISSION",
            "Você não possui permissão para executar esta operação.",
            { acceptedPermissions },
        ));
        return;
    }

    next();
};
