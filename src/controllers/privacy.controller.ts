import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createPrivacyRequestSchema,
    privacyRequestListQuerySchema,
    processPrivacyRequestSchema,
    recordConsentSchema,
} from "../schemas/privacy.schemas.js";
import { privacyService } from "../services/privacy.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

export const recordOwnConsent = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = recordConsentSchema.parse(request.body);
    const consent = await privacyService.recordOwnConsent(context, input, {
        ipAddress: request.ip,
        userAgent: request.get("user-agent"),
    });
    response.status(201).json({ data: { consent } });
};

export const listOwnConsents = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const consents = await privacyService.listOwnConsents(context);
    response.json({ data: { consents } });
};

export const createOwnPrivacyRequest = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createPrivacyRequestSchema.parse(request.body);
    const privacyRequest = await privacyService.createOwnRequest(
        context,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { privacyRequest } });
};

export const listPrivacyRequests = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = privacyRequestListQuerySchema.parse(request.query);
    const result = await privacyService.listRequests(context, query);
    response.json({
        data: { privacyRequests: result.items },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const processPrivacyRequest = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = processPrivacyRequestSchema.parse(request.body);
    const privacyRequest = await privacyService.process(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { privacyRequest } });
};
