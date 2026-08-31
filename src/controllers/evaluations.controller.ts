import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    assignEvaluationParticipantsSchema,
    completeEvaluationFeedbackSchema,
    createEvaluationCycleSchema,
    createPerformanceGoalSchema,
    evaluationAssignmentListQuerySchema,
    evaluationCycleListQuerySchema,
    myEvaluationListQuerySchema,
    scheduleEvaluationFeedbackSchema,
    submitManagerReviewSchema,
    submitSelfReviewSchema,
    updateEvaluationCycleSchema,
    updateMyPerformanceGoalSchema,
    updatePerformanceGoalSchema,
} from "../schemas/evaluations.schemas.js";
import { evaluationsService } from "../services/evaluations.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
});
const parseGoalId = (request: Request): string => idParameterSchema.parse({
    id: request.params.goalId,
}).id;

export const listEvaluationCycles = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = evaluationCycleListQuerySchema.parse(request.query);
    const result = await evaluationsService.listCycles(context, query);
    response.json({ data: { cycles: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getEvaluationCycle = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const cycle = await evaluationsService.getCycle(context, id);
    response.json({ data: { cycle } });
};

export const createEvaluationCycle = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createEvaluationCycleSchema.parse(request.body);
    const cycle = await evaluationsService.createCycle(context, input, getAuditActor(request));
    response.status(201).json({ data: { cycle } });
};

export const updateEvaluationCycle = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateEvaluationCycleSchema.parse(request.body);
    const cycle = await evaluationsService.updateCycle(context, id, input, getAuditActor(request));
    response.json({ data: { cycle } });
};

export const archiveEvaluationCycle = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await evaluationsService.archiveCycle(context, id, getAuditActor(request));
    response.status(204).send();
};

export const assignEvaluationParticipants = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = assignEvaluationParticipantsSchema.parse(request.body);
    const result = await evaluationsService.assignParticipants(
        context, id, input, getAuditActor(request),
    );
    response.status(201).json({ data: result });
};

export const listEvaluationAssignments = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = evaluationAssignmentListQuerySchema.parse(request.query);
    const result = await evaluationsService.listAssignments(context, query);
    response.json({ data: { assignments: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getEvaluationAssignment = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const assignment = await evaluationsService.getAssignment(context, id);
    response.json({ data: { assignment } });
};

export const cancelEvaluationAssignment = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await evaluationsService.cancelAssignment(context, id, getAuditActor(request));
    response.status(204).send();
};

export const submitManagerReview = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = submitManagerReviewSchema.parse(request.body);
    const assignment = await evaluationsService.submitManagerReview(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { assignment } });
};

export const scheduleEvaluationFeedback = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = scheduleEvaluationFeedbackSchema.parse(request.body);
    const assignment = await evaluationsService.scheduleFeedback(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { assignment } });
};

export const completeEvaluationFeedback = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = completeEvaluationFeedbackSchema.parse(request.body);
    const assignment = await evaluationsService.completeFeedback(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { assignment } });
};

export const createPerformanceGoal = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: assignmentId } = idParameterSchema.parse(request.params);
    const input = createPerformanceGoalSchema.parse(request.body);
    const goal = await evaluationsService.createGoal(
        context, assignmentId, input, getAuditActor(request),
    );
    response.status(201).json({ data: { goal } });
};

export const updatePerformanceGoal = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: assignmentId } = idParameterSchema.parse(request.params);
    const goalId = parseGoalId(request);
    const input = updatePerformanceGoalSchema.parse(request.body);
    const goal = await evaluationsService.updateGoal(
        context, assignmentId, goalId, input, getAuditActor(request),
    );
    response.json({ data: { goal } });
};

export const archivePerformanceGoal = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: assignmentId } = idParameterSchema.parse(request.params);
    await evaluationsService.archiveGoal(
        context, assignmentId, parseGoalId(request), getAuditActor(request),
    );
    response.status(204).send();
};

export const listMyEvaluations = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = myEvaluationListQuerySchema.parse(request.query);
    const result = await evaluationsService.listMine(context, query);
    response.json({ data: { assignments: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total) });
};

export const getMyEvaluation = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const assignment = await evaluationsService.getMine(context, id);
    response.json({ data: { assignment } });
};

export const submitMySelfReview = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = submitSelfReviewSchema.parse(request.body);
    const assignment = await evaluationsService.submitSelfReview(
        context, id, input, getAuditActor(request),
    );
    response.json({ data: { assignment } });
};

export const updateMyPerformanceGoal = async (
    request: Request, response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id: assignmentId } = idParameterSchema.parse(request.params);
    const input = updateMyPerformanceGoalSchema.parse(request.body);
    const goal = await evaluationsService.updateMyGoal(
        context, assignmentId, parseGoalId(request), input, getAuditActor(request),
    );
    response.json({ data: { goal } });
};
