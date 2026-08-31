import type { Request, Response } from "express";
import { AppError } from "../errors/app-error.js";
import {
    confirmMfaSetupSchema,
    disableMfaSchema,
    verifyMfaLoginSchema,
} from "../schemas/auth.schemas.js";
import { mfaService } from "../services/mfa.service.js";
import {
    authenticationPayload,
    setAuthenticationCookies,
} from "../utils/auth-response.js";
import { sessionMetadata } from "./auth.controller.js";

const requireAuthentication = (request: Request) => {
    if (!request.auth) {
        throw new AppError(401, "AUTHENTICATION_REQUIRED", "Autenticação obrigatória.");
    }
    return request.auth;
};

export const verifyMfaLogin = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const input = verifyMfaLoginSchema.parse(request.body);
    const authentication = await mfaService.verifyLogin(
        input,
        sessionMetadata(request),
    );
    setAuthenticationCookies(response, authentication);
    response.json({ data: authenticationPayload(authentication) });
};

export const getMfaStatus = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const status = await mfaService.status(requireAuthentication(request));
    response.json({ data: { mfa: status } });
};

export const beginMfaSetup = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const setup = await mfaService.beginSetup(requireAuthentication(request));
    response.status(201).json({ data: { setup } });
};

export const confirmMfaSetup = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const input = confirmMfaSetupSchema.parse(request.body);
    const result = await mfaService.confirmSetup(
        requireAuthentication(request),
        input.code,
    );
    response.json({ data: result });
};

export const disableMfa = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const input = disableMfaSchema.parse(request.body);
    await mfaService.disable(requireAuthentication(request), input);
    response.status(204).send();
};

