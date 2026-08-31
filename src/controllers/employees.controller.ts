import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createEmployeeSchema,
    employeeListQuerySchema,
    updateEmployeeSchema,
} from "../schemas/employees.schemas.js";
import { employeesService } from "../services/employees.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

export const listEmployees = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = employeeListQuerySchema.parse(request.query);
    const result = await employeesService.list(context, query);

    response.json({
        data: { employees: result.items },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const getOwnEmployeeProfile = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const employee = await employeesService.getOwnProfile(requireAuthenticationContext(request));
    response.json({ data: { employee } });
};

export const getEmployee = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const employee = await employeesService.getById(context, id);
    response.json({ data: { employee } });
};

export const createEmployee = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createEmployeeSchema.parse(request.body);
    const employee = await employeesService.create(context, input, getAuditActor(request));
    response.status(201).json({ data: { employee } });
};

export const updateEmployee = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateEmployeeSchema.parse(request.body);
    const employee = await employeesService.update(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { employee } });
};

export const archiveEmployee = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await employeesService.archive(context, id, getAuditActor(request));
    response.status(204).send();
};
