import type { Request, Response } from "express";
import { updateCompanySchema } from "../schemas/organization.schemas.js";
import { organizationService } from "../services/organization.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

export const getCurrentCompany = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const company = await organizationService.getCompany(context.companyId);
    response.json({ data: { company } });
};

export const updateCurrentCompany = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = updateCompanySchema.parse(request.body);
    const company = await organizationService.updateCompany(
        context.companyId,
        input,
        getAuditActor(request),
    );
    response.json({ data: { company } });
};
