import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    applicationListQuerySchema,
    candidateListQuerySchema,
    createApplicationSchema,
    createCandidateSchema,
    createVacancySchema,
    updateApplicationSchema,
    updateCandidateSchema,
    updateVacancySchema,
    vacancyListQuerySchema,
} from "../schemas/recruitment.schemas.js";
import { recruitmentService } from "../services/recruitment.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
});

export const listVacancies = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = vacancyListQuerySchema.parse(request.query);
    const result = await recruitmentService.listVacancies(context, query);
    response.json({
        data: { vacancies: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getVacancy = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const vacancy = await recruitmentService.getVacancy(context, id);
    response.json({ data: { vacancy } });
};

export const createVacancy = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createVacancySchema.parse(request.body);
    const vacancy = await recruitmentService.createVacancy(
        context,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { vacancy } });
};

export const updateVacancy = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateVacancySchema.parse(request.body);
    const vacancy = await recruitmentService.updateVacancy(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { vacancy } });
};

export const archiveVacancy = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await recruitmentService.archiveVacancy(context, id, getAuditActor(request));
    response.status(204).send();
};

export const getVacancyBoard = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const board = await recruitmentService.getBoard(context, id);
    response.json({ data: { board } });
};

export const listCandidates = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = candidateListQuerySchema.parse(request.query);
    const result = await recruitmentService.listCandidates(context, query);
    response.json({
        data: { candidates: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getCandidate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const result = await recruitmentService.getCandidate(context, id);
    response.json({ data: result });
};

export const createCandidate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createCandidateSchema.parse(request.body);
    const candidate = await recruitmentService.createCandidate(
        context,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { candidate } });
};

export const updateCandidate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateCandidateSchema.parse(request.body);
    const candidate = await recruitmentService.updateCandidate(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { candidate } });
};

export const archiveCandidate = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await recruitmentService.archiveCandidate(context, id, getAuditActor(request));
    response.status(204).send();
};

export const listApplications = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = applicationListQuerySchema.parse(request.query);
    const result = await recruitmentService.listApplications(context, query);
    response.json({
        data: { applications: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getApplication = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const result = await recruitmentService.getApplication(context, id);
    response.json({ data: result });
};

export const createApplication = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: vacancyId } = idParameterSchema.parse(request.params);
    const input = createApplicationSchema.parse(request.body);
    const application = await recruitmentService.createApplication(
        context,
        vacancyId,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { application } });
};

export const updateApplication = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateApplicationSchema.parse(request.body);
    const application = await recruitmentService.updateApplication(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { application } });
};

export const withdrawApplication = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await recruitmentService.withdrawApplication(context, id, getAuditActor(request));
    response.status(204).send();
};
