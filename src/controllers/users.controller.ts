import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createUserSchema,
    updateUserSchema,
    userListQuerySchema,
} from "../schemas/users.schemas.js";
import { accountService } from "../services/account.service.js";
import { usersService } from "../services/users.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

export const listUsers = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = userListQuerySchema.parse(request.query);
    const result = await usersService.list(context, query);

    response.json({
        data: { users: result.items },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const getUser = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const user = await usersService.getById(context, id);
    response.json({ data: { user } });
};

export const createUser = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createUserSchema.parse(request.body);
    const result = await usersService.create(context, input, getAuditActor(request));
    response.status(201).json({ data: result });
};

export const inviteUser = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await usersService.getById(context, id);
    const invitation = await accountService.issueInvitation(
        context, id, getAuditActor(request), { ipAddress: request.ip },
    );
    response.status(202).json({ data: { invitation } });
};

export const updateUser = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateUserSchema.parse(request.body);
    const user = await usersService.update(context, id, input, getAuditActor(request));
    response.json({ data: { user } });
};

export const archiveUser = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await usersService.archive(context, id, getAuditActor(request));
    response.status(204).send();
};

export const listRoles = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const roles = await usersService.listRoles(context);
    response.json({ data: { roles } });
};

export const listPermissions = async (request: Request, response: Response): Promise<void> => {
    requireAuthenticationContext(request);
    const permissions = await usersService.listPermissions();
    response.json({ data: { permissions } });
};
