import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createJourneyAssignmentSchema,
    createJourneyTemplateSchema,
    journeyAssignmentListQuerySchema,
    journeyTemplateListQuerySchema,
    myJourneyListQuerySchema,
    updateJourneyAssignmentSchema,
    updateJourneyTaskSchema,
    updateJourneyTemplateSchema,
    updateMyJourneyTaskSchema,
} from "../schemas/journeys.schemas.js";
import { journeysService } from "../services/journeys.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
});

export const listJourneyTemplates = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = journeyTemplateListQuerySchema.parse(request.query);
    const result = await journeysService.listTemplates(context, query);
    response.json({ data: { templates: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getJourneyTemplate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const template = await journeysService.getTemplate(context, id);
    response.json({ data: { template } });
};

export const createJourneyTemplate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createJourneyTemplateSchema.parse(request.body);
    const template = await journeysService.createTemplate(context, input, getAuditActor(request));
    response.status(201).json({ data: { template } });
};

export const updateJourneyTemplate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateJourneyTemplateSchema.parse(request.body);
    const template = await journeysService.updateTemplate(context, id, input, getAuditActor(request));
    response.json({ data: { template } });
};

export const archiveJourneyTemplate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await journeysService.archiveTemplate(context, id, getAuditActor(request));
    response.status(204).send();
};

export const listJourneyAssignments = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = journeyAssignmentListQuerySchema.parse(request.query);
    const result = await journeysService.listAssignments(context, query);
    response.json({ data: { assignments: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getJourneyAssignment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const assignment = await journeysService.getAssignment(context, id);
    response.json({ data: { assignment } });
};

export const createJourneyAssignment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createJourneyAssignmentSchema.parse(request.body);
    const assignment = await journeysService.createAssignment(context, input, getAuditActor(request));
    response.status(201).json({ data: { assignment } });
};

export const updateJourneyAssignment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateJourneyAssignmentSchema.parse(request.body);
    const assignment = await journeysService.updateAssignment(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { assignment } });
};

export const cancelJourneyAssignment = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await journeysService.cancelAssignment(context, id, getAuditActor(request));
    response.status(204).send();
};

export const updateJourneyTask = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: assignmentId } = idParameterSchema.parse(request.params);
    const { id: taskId } = idParameterSchema.parse({ id: request.params.taskId });
    const input = updateJourneyTaskSchema.parse(request.body);
    const task = await journeysService.updateTask(
        context, assignmentId, taskId, input, getAuditActor(request),
    );
    response.json({ data: { task } });
};

export const listMyJourneys = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = myJourneyListQuerySchema.parse(request.query);
    const result = await journeysService.listMine(context, query);
    response.json({ data: { assignments: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getMyJourney = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const assignment = await journeysService.getMine(context, id);
    response.json({ data: { assignment } });
};

export const updateMyJourneyTask = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: assignmentId } = idParameterSchema.parse(request.params);
    const { id: taskId } = idParameterSchema.parse({ id: request.params.taskId });
    const input = updateMyJourneyTaskSchema.parse(request.body);
    const task = await journeysService.updateMyTask(
        context, assignmentId, taskId, input, getAuditActor(request),
    );
    response.json({ data: { task } });
};
