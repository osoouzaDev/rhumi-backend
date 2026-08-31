import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createPositionSchema,
    positionListQuerySchema,
    updatePositionSchema,
} from "../schemas/organization.schemas.js";
import { organizationService } from "../services/organization.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

export const listPositions = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = positionListQuerySchema.parse(request.query);
    const result = await organizationService.listPositions(context.companyId, query);

    response.json({
        data: { positions: result.items },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const getPosition = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const position = await organizationService.getPosition(context.companyId, id);
    response.json({ data: { position } });
};

export const createPosition = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createPositionSchema.parse(request.body);
    const position = await organizationService.createPosition(
        context.companyId,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { position } });
};

export const updatePosition = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updatePositionSchema.parse(request.body);
    const position = await organizationService.updatePosition(
        context.companyId,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { position } });
};

export const archivePosition = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await organizationService.archivePosition(context.companyId, id, getAuditActor(request));
    response.status(204).send();
};
