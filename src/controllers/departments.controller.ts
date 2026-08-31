import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createDepartmentSchema,
    departmentListQuerySchema,
    updateDepartmentSchema,
} from "../schemas/organization.schemas.js";
import { organizationService } from "../services/organization.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

export const listDepartments = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = departmentListQuerySchema.parse(request.query);
    const result = await organizationService.listDepartments(context.companyId, query);

    response.json({
        data: { departments: result.items },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const getDepartment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const department = await organizationService.getDepartment(context.companyId, id);
    response.json({ data: { department } });
};

export const createDepartment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createDepartmentSchema.parse(request.body);
    const department = await organizationService.createDepartment(
        context.companyId,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { department } });
};

export const updateDepartment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateDepartmentSchema.parse(request.body);
    const department = await organizationService.updateDepartment(
        context.companyId,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { department } });
};

export const archiveDepartment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await organizationService.archiveDepartment(context.companyId, id, getAuditActor(request));
    response.status(204).send();
};
