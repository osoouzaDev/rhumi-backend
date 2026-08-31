import { z } from "zod";
import {
    dateOnlySchema,
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const evaluationCycleStatusSchema = z.enum([
    "draft", "scheduled", "active", "completed", "cancelled",
]);
export const evaluationCompetencyCategorySchema = z.enum([
    "behavioral", "technical", "leadership", "cultural",
]);
export const evaluationAssignmentStatusSchema = z.enum([
    "pending", "self_review", "manager_review", "feedback_pending", "completed", "cancelled",
]);
export const performanceGoalStatusSchema = z.enum([
    "not_started", "in_progress", "completed", "cancelled",
]);

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = z.string().trim().url().max(1_000).nullable();

const competencySchema = z.object({
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().min(10).max(10_000),
    category: evaluationCompetencyCategorySchema,
    weight: z.number().min(0.01).max(100),
}).strict();

const cycleDateFields = {
    startsOn: dateOnlySchema,
    selfReviewDeadline: dateOnlySchema,
    managerReviewDeadline: dateOnlySchema,
    feedbackDeadline: dateOnlySchema,
};

const validCycleDates = (input: Partial<{
    startsOn: string;
    selfReviewDeadline: string;
    managerReviewDeadline: string;
    feedbackDeadline: string;
}>): boolean => {
    if (!input.startsOn || !input.selfReviewDeadline
        || !input.managerReviewDeadline || !input.feedbackDeadline) return true;
    return input.startsOn <= input.selfReviewDeadline
        && input.selfReviewDeadline <= input.managerReviewDeadline
        && input.managerReviewDeadline <= input.feedbackDeadline;
};

const validWeights = (input: { selfWeight?: number; managerWeight?: number }): boolean => {
    if (input.selfWeight === undefined || input.managerWeight === undefined) return true;
    return Math.abs(input.selfWeight + input.managerWeight - 100) < 0.001;
};

const validCompetencyWeights = (input: {
    competencies?: Array<z.infer<typeof competencySchema>>;
}): boolean => !input.competencies || Math.abs(
    input.competencies.reduce((total, item) => total + item.weight, 0) - 100,
) < 0.001;

export const evaluationCycleListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    status: evaluationCycleStatusSchema.optional(),
}).strict();

export const createEvaluationCycleSchema = z.object({
    departmentId: uuidSchema.nullable().optional(),
    code: z.string().trim().min(2).max(60)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido."),
    name: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(20_000),
    status: z.enum(["draft", "scheduled", "active"]).default("draft"),
    ...cycleDateFields,
    selfWeight: z.number().min(0).max(100).default(30),
    managerWeight: z.number().min(0).max(100).default(70),
    competencies: z.array(competencySchema).min(1).max(100),
}).strict()
    .refine(validCycleDates, { message: "As datas do ciclo estão fora de ordem.",
        path: ["startsOn"] })
    .refine(validWeights, { message: "Os pesos da autoavaliação e do gestor devem somar 100.",
        path: ["selfWeight"] })
    .refine(validCompetencyWeights, { message: "Os pesos das competências devem somar 100.",
        path: ["competencies"] });

export const updateEvaluationCycleSchema = z.object({
    departmentId: uuidSchema.nullable().optional(),
    code: z.string().trim().min(2).max(60)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido.").optional(),
    name: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().min(20).max(20_000).optional(),
    status: evaluationCycleStatusSchema.optional(),
    startsOn: dateOnlySchema.optional(),
    selfReviewDeadline: dateOnlySchema.optional(),
    managerReviewDeadline: dateOnlySchema.optional(),
    feedbackDeadline: dateOnlySchema.optional(),
    selfWeight: z.number().min(0).max(100).optional(),
    managerWeight: z.number().min(0).max(100).optional(),
    competencies: z.array(competencySchema).min(1).max(100).optional(),
}).strict()
    .refine(hasAtLeastOneDefinedValue, { message: "Informe ao menos um campo para atualização." })
    .refine(validCycleDates, { message: "As datas do ciclo estão fora de ordem." })
    .refine(validWeights, { message: "Os pesos informados devem somar 100." })
    .refine(validCompetencyWeights, { message: "Os pesos das competências devem somar 100." });

const participantSchema = z.object({
    employeeId: uuidSchema,
    evaluatorEmployeeId: uuidSchema,
}).strict();

export const assignEvaluationParticipantsSchema = z.object({
    participants: z.array(participantSchema).min(1).max(500)
        .refine((items) => new Set(items.map((item) => item.employeeId)).size === items.length,
            "O mesmo colaborador não pode ser informado mais de uma vez."),
}).strict();

export const evaluationAssignmentListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    cycleId: uuidSchema.optional(),
    employeeId: uuidSchema.optional(),
    evaluatorEmployeeId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    status: evaluationAssignmentStatusSchema.optional(),
}).strict();

const reviewResponseSchema = z.object({
    competencyId: uuidSchema,
    score: z.number().min(1).max(5),
    comment: nullableText(10_000).optional(),
}).strict();

const uniqueResponses = (
    responses: Array<z.infer<typeof reviewResponseSchema>>,
): boolean => new Set(responses.map((response) => response.competencyId)).size === responses.length;

export const submitSelfReviewSchema = z.object({
    responses: z.array(reviewResponseSchema).min(1).max(100).refine(
        uniqueResponses, "Uma competência não pode ser respondida mais de uma vez.",
    ),
    employeeSummary: nullableText(20_000).optional(),
}).strict();

export const submitManagerReviewSchema = z.object({
    responses: z.array(reviewResponseSchema).min(1).max(100).refine(
        uniqueResponses, "Uma competência não pode ser respondida mais de uma vez.",
    ),
    strengths: z.string().trim().min(10).max(20_000),
    improvementPoints: z.string().trim().min(10).max(20_000),
    developmentActions: z.string().trim().min(10).max(20_000),
}).strict();

export const scheduleEvaluationFeedbackSchema = z.object({
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    location: z.string().trim().max(255).nullable().optional(),
    meetingUrl: nullableUrl.optional(),
}).strict().refine((input) => new Date(input.endsAt).getTime() > new Date(input.startsAt).getTime(), {
    message: "O término do feedback deve ser posterior ao início.", path: ["endsAt"],
});

export const completeEvaluationFeedbackSchema = z.object({
    finalFeedback: z.string().trim().min(20).max(20_000),
}).strict();

export const createPerformanceGoalSchema = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(10_000),
    successCriteria: z.string().trim().min(10).max(10_000),
    weight: z.number().min(0.01).max(100),
    targetDate: dateOnlySchema,
    managerNotes: nullableText(10_000).optional(),
}).strict();

export const updatePerformanceGoalSchema = z.object({
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().min(10).max(10_000).optional(),
    successCriteria: z.string().trim().min(10).max(10_000).optional(),
    weight: z.number().min(0.01).max(100).optional(),
    targetDate: dateOnlySchema.optional(),
    status: performanceGoalStatusSchema.optional(),
    progressPercent: z.number().min(0).max(100).optional(),
    employeeNotes: nullableText(10_000).optional(),
    managerNotes: nullableText(10_000).optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export const updateMyPerformanceGoalSchema = z.object({
    progressPercent: z.number().min(0).max(100),
    employeeNotes: nullableText(10_000).optional(),
}).strict();

export const myEvaluationListQuerySchema = z.object({
    ...paginationQueryShape,
    status: evaluationAssignmentStatusSchema.optional(),
}).strict();

export type EvaluationCycleListQuery = z.infer<typeof evaluationCycleListQuerySchema>;
export type CreateEvaluationCycleInput = z.infer<typeof createEvaluationCycleSchema>;
export type UpdateEvaluationCycleInput = z.infer<typeof updateEvaluationCycleSchema>;
export type AssignEvaluationParticipantsInput = z.infer<typeof assignEvaluationParticipantsSchema>;
export type EvaluationAssignmentListQuery = z.infer<typeof evaluationAssignmentListQuerySchema>;
export type SubmitSelfReviewInput = z.infer<typeof submitSelfReviewSchema>;
export type SubmitManagerReviewInput = z.infer<typeof submitManagerReviewSchema>;
export type ScheduleEvaluationFeedbackInput = z.infer<typeof scheduleEvaluationFeedbackSchema>;
export type CompleteEvaluationFeedbackInput = z.infer<typeof completeEvaluationFeedbackSchema>;
export type CreatePerformanceGoalInput = z.infer<typeof createPerformanceGoalSchema>;
export type UpdatePerformanceGoalInput = z.infer<typeof updatePerformanceGoalSchema>;
export type UpdateMyPerformanceGoalInput = z.infer<typeof updateMyPerformanceGoalSchema>;
export type MyEvaluationListQuery = z.infer<typeof myEvaluationListQuerySchema>;
