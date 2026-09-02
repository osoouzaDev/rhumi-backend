import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    activateAccountSchema,
    changePasswordSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    verifyEmailSchema,
} from "../schemas/auth.schemas.js";
import { accountService } from "../services/account.service.js";
import { clearAuthenticationCookies } from "../utils/auth-response.js";
import { requireAuthenticationContext } from "../utils/request-auth.js";

const requestMetadata = (request: Request) => ({ ipAddress: request.ip });

export const forgotPassword = async (request: Request, response: Response): Promise<void> => {
    const input = forgotPasswordSchema.parse(request.body);
    const delivery = await accountService.requestPasswordReset(input, requestMetadata(request));
    response.status(202).json({ data: delivery });
};

export const resetPassword = async (request: Request, response: Response): Promise<void> => {
    const input = resetPasswordSchema.parse(request.body);
    await accountService.resetPassword(input);
    clearAuthenticationCookies(response);
    response.status(204).send();
};

export const activateAccount = async (request: Request, response: Response): Promise<void> => {
    const input = activateAccountSchema.parse(request.body);
    await accountService.activate(input);
    clearAuthenticationCookies(response);
    response.status(204).send();
};

export const requestEmailVerification = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const delivery = await accountService.requestEmailVerification(
        context,
        requestMetadata(request),
    );
    response.status(202).json({ data: delivery });
};

export const verifyEmail = async (request: Request, response: Response): Promise<void> => {
    const { token } = verifyEmailSchema.parse(request.body);
    await accountService.verifyEmail(token);
    response.status(204).send();
};

export const changePassword = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = changePasswordSchema.parse(request.body);
    await accountService.changePassword(context, input);
    response.status(204).send();
};

export const listSessions = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const sessions = await accountService.listSessions(context);
    response.json({ data: { sessions } });
};

export const revokeSession = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await accountService.revokeSession(context, id);
    if (id === context.sessionId) {
        clearAuthenticationCookies(response);
    }
    response.status(204).send();
};
