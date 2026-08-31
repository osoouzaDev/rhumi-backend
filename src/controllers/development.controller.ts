import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    careerTrackListQuerySchema,
    createCareerTrackSchema,
    createDevelopmentPlanSchema,
    developmentPlanListQuerySchema,
    myDevelopmentPlanListQuerySchema,
    updateCareerTrackSchema,
    updateDevelopmentActionSchema,
    updateDevelopmentPlanSchema,
    updateMyDevelopmentActionSchema,
    upsertCareerProfileSchema,
} from "../schemas/development.schemas.js";
import { developmentService } from "../services/development.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
});
const parseActionId = (request: Request): string => idParameterSchema.parse({
    id: request.params.actionId,
}).id;

export const listCareerTracks = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = careerTrackListQuerySchema.parse(request.query);
    const result = await developmentService.listTracks(context, query);
    response.json({ data: { tracks: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getCareerTrack = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const track = await developmentService.getTrack(context, id);
    response.json({ data: { track } });
};

export const createCareerTrack = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createCareerTrackSchema.parse(request.body);
    const track = await developmentService.createTrack(context, input, getAuditActor(request));
    response.status(201).json({ data: { track } });
};

export const updateCareerTrack = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateCareerTrackSchema.parse(request.body);
    const track = await developmentService.updateTrack(context, id, input, getAuditActor(request));
    response.json({ data: { track } });
};

export const archiveCareerTrack = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await developmentService.archiveTrack(context, id, getAuditActor(request));
    response.status(204).send();
};

export const getCareerProfile = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: employeeId } = idParameterSchema.parse({ id: request.params.employeeId });
    const result = await developmentService.getProfile(context, employeeId);
    response.json({ data: result });
};

export const upsertCareerProfile = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: employeeId } = idParameterSchema.parse({ id: request.params.employeeId });
    const input = upsertCareerProfileSchema.parse(request.body);
    const result = await developmentService.upsertProfile(
        context, employeeId, input, getAuditActor(request),
    );
    response.json({ data: result });
};

export const listDevelopmentPlans = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = developmentPlanListQuerySchema.parse(request.query);
    const result = await developmentService.listPlans(context, query);
    response.json({ data: { plans: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getDevelopmentPlan = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const plan = await developmentService.getPlan(context, id);
    response.json({ data: { plan } });
};

export const createDevelopmentPlan = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createDevelopmentPlanSchema.parse(request.body);
    const plan = await developmentService.createPlan(context, input, getAuditActor(request));
    response.status(201).json({ data: { plan } });
};

export const updateDevelopmentPlan = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateDevelopmentPlanSchema.parse(request.body);
    const plan = await developmentService.updatePlan(context, id, input, getAuditActor(request));
    response.json({ data: { plan } });
};

export const cancelDevelopmentPlan = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await developmentService.cancelPlan(context, id, getAuditActor(request));
    response.status(204).send();
};

export const updateDevelopmentAction = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: planId } = idParameterSchema.parse(request.params);
    const input = updateDevelopmentActionSchema.parse(request.body);
    const action = await developmentService.updateAction(
        context, planId, parseActionId(request), input, getAuditActor(request),
    );
    response.json({ data: { action } });
};

export const getMyCareer = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const result = await developmentService.getMyCareer(context);
    response.json({ data: result });
};

export const listMyDevelopmentPlans = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = myDevelopmentPlanListQuerySchema.parse(request.query);
    const result = await developmentService.listMine(context, query);
    response.json({ data: { plans: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getMyDevelopmentPlan = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const plan = await developmentService.getMine(context, id);
    response.json({ data: { plan } });
};

export const updateMyDevelopmentAction = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: planId } = idParameterSchema.parse(request.params);
    const input = updateMyDevelopmentActionSchema.parse(request.body);
    const action = await developmentService.updateMyAction(
        context, planId, parseActionId(request), input, getAuditActor(request),
    );
    response.json({ data: { action } });
};
