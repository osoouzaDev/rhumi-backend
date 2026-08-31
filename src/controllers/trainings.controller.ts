import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    assignTrainingEnrollmentsSchema,
    createTrainingClassSchema,
    createTrainingSchema,
    myTrainingListQuerySchema,
    submitTrainingExamSchema,
    trainingClassListQuerySchema,
    trainingEnrollmentListQuerySchema,
    trainingListQuerySchema,
    updateTrainingClassSchema,
    updateTrainingProgressSchema,
    updateTrainingSchema,
    upsertTrainingExamSchema,
} from "../schemas/trainings.schemas.js";
import { trainingsService } from "../services/trainings.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
});

export const listTrainings = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = trainingListQuerySchema.parse(request.query);
    const result = await trainingsService.listTrainings(context, query);
    response.json({
        data: { trainings: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getTraining = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const training = await trainingsService.getTraining(context, id);
    response.json({ data: { training } });
};

export const createTraining = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createTrainingSchema.parse(request.body);
    const training = await trainingsService.createTraining(context, input, getAuditActor(request));
    response.status(201).json({ data: { training } });
};

export const updateTraining = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateTrainingSchema.parse(request.body);
    const training = await trainingsService.updateTraining(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { training } });
};

export const archiveTraining = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await trainingsService.archiveTraining(context, id, getAuditActor(request));
    response.status(204).send();
};

export const listTrainingClasses = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = trainingClassListQuerySchema.parse(request.query);
    const result = await trainingsService.listClasses(context, query);
    response.json({
        data: { classes: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getTrainingClass = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const trainingClass = await trainingsService.getClass(context, id);
    response.json({ data: { class: trainingClass } });
};

export const createTrainingClass = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: trainingId } = idParameterSchema.parse(request.params);
    const input = createTrainingClassSchema.parse(request.body);
    const trainingClass = await trainingsService.createClass(
        context, trainingId, input, getAuditActor(request),
    );
    response.status(201).json({ data: { class: trainingClass } });
};

export const updateTrainingClass = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateTrainingClassSchema.parse(request.body);
    const trainingClass = await trainingsService.updateClass(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { class: trainingClass } });
};

export const archiveTrainingClass = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await trainingsService.archiveClass(context, id, getAuditActor(request));
    response.status(204).send();
};

export const listTrainingEnrollments = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: classId } = idParameterSchema.parse(request.params);
    const query = trainingEnrollmentListQuerySchema.parse(request.query);
    const result = await trainingsService.listEnrollments(context, classId, query);
    response.json({
        data: { enrollments: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const assignTrainingEnrollments = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: classId } = idParameterSchema.parse(request.params);
    const input = assignTrainingEnrollmentsSchema.parse(request.body);
    const result = await trainingsService.assignEnrollments(
        context, classId, input, getAuditActor(request),
    );
    response.status(201).json({ data: result });
};

export const cancelTrainingEnrollment = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await trainingsService.cancelEnrollment(context, id, getAuditActor(request));
    response.status(204).send();
};

export const getTrainingExam = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: trainingId } = idParameterSchema.parse(request.params);
    const exam = await trainingsService.getExam(context, trainingId);
    response.json({ data: { exam } });
};

export const upsertTrainingExam = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: trainingId } = idParameterSchema.parse(request.params);
    const input = upsertTrainingExamSchema.parse(request.body);
    const exam = await trainingsService.upsertExam(
        context, trainingId, input, getAuditActor(request),
    );
    response.json({ data: { exam } });
};

export const listMyTrainings = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = myTrainingListQuerySchema.parse(request.query);
    const result = await trainingsService.listMyTrainings(context, query);
    response.json({
        data: { enrollments: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getMyTraining = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const enrollment = await trainingsService.getMyTraining(context, id);
    response.json({ data: { enrollment } });
};

export const updateMyTrainingProgress = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateTrainingProgressSchema.parse(request.body);
    const enrollment = await trainingsService.updateMyProgress(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { enrollment } });
};

export const getMyTrainingExam = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const exam = await trainingsService.getMyExam(context, id);
    response.json({ data: { exam } });
};

export const submitMyTrainingExam = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = submitTrainingExamSchema.parse(request.body);
    const result = await trainingsService.submitMyExam(
        context, id, input, getAuditActor(request),
    );
    response.status(201).json({ data: result });
};
