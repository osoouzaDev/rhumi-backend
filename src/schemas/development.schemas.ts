import { z } from "zod";
import {
    dateOnlySchema,
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const careerTrackStatusSchema = z.enum(["draft", "published", "archived"]);
export const developmentPlanStatusSchema = z.enum([
    "draft", "active", "completed", "overdue", "cancelled",
]);
export const developmentItemStatusSchema = z.enum([
    "not_started", "in_progress", "completed", "blocked", "cancelled",
]);
export const developmentActionTypeSchema = z.enum([
    "training", "mentoring", "project", "course", "reading", "other",
]);
const competencyCategorySchema = z.enum([
    "behavioral", "technical", "leadership", "cultural",
]);
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = z.string().trim().url().max(1_000).nullable();

const careerCompetencySchema = z.object({
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().min(10).max(10_000),
    category: competencyCategorySchema,
    requiredLevel: z.number().min(1).max(5),
}).strict();

const careerLevelTrainingSchema = z.object({
    trainingId: uuidSchema,
    required: z.boolean().default(true),
}).strict();

const careerLevelSchema = z.object({
    positionId: uuidSchema,
    name: z.string().trim().min(2).max(180),
    description: z.string().trim().min(10).max(10_000),
    minimumMonthsExperience: z.number().int().min(0).max(1_200).default(0),
    requirements: nullableText(20_000).optional(),
    competencies: z.array(careerCompetencySchema).min(1).max(100),
    trainings: z.array(careerLevelTrainingSchema).max(100).default([])
        .refine((items) => new Set(items.map((item) => item.trainingId)).size === items.length,
            "O mesmo treinamento não pode ser informado mais de uma vez."),
}).strict();

const careerTrackFields = {
    departmentId: uuidSchema.nullable().optional(),
    code: z.string().trim().min(2).max(60)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido."),
    name: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(20_000),
    status: careerTrackStatusSchema,
    levels: z.array(careerLevelSchema).min(1).max(50)
        .refine((levels) => new Set(levels.map((level) => level.positionId)).size === levels.length,
            "Um cargo não pode aparecer em mais de um nível da mesma trilha."),
};

export const careerTrackListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    status: careerTrackStatusSchema.optional(),
}).strict();

export const createCareerTrackSchema = z.object({
    ...careerTrackFields,
    status: careerTrackStatusSchema.default("draft"),
}).strict();

export const updateCareerTrackSchema = z.object(careerTrackFields)
    .partial().strict().refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    });

export const upsertCareerProfileSchema = z.object({
    trackId: uuidSchema,
    currentLevelId: uuidSchema.nullable().optional(),
    targetLevelId: uuidSchema.nullable().optional(),
    readinessPercent: z.number().min(0).max(100).optional(),
    managerNotes: nullableText(20_000).optional(),
}).strict();

const developmentActionSchema = z.object({
    responsibleEmployeeId: uuidSchema.optional(),
    actionType: developmentActionTypeSchema,
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(10_000),
    dueAt: z.iso.datetime({ offset: true }),
    trainingId: uuidSchema.nullable().optional(),
    meetingEndsAt: z.iso.datetime({ offset: true }).nullable().optional(),
    resourceUrl: nullableUrl.optional(),
    managerNotes: nullableText(10_000).optional(),
}).strict().superRefine((action, context) => {
    if (action.actionType === "training" && !action.trainingId) {
        context.addIssue({ code: "custom",
            message: "A ação de treinamento exige um treinamento vinculado.",
            path: ["trainingId"] });
    }
    if (action.actionType === "mentoring" && (!action.meetingEndsAt
        || new Date(action.meetingEndsAt).getTime() <= new Date(action.dueAt).getTime())) {
        context.addIssue({ code: "custom",
            message: "A mentoria exige um término posterior ao início.",
            path: ["meetingEndsAt"] });
    }
});

const developmentObjectiveSchema = z.object({
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(10_000),
    successCriteria: z.string().trim().min(10).max(10_000),
    weight: z.number().min(0.01).max(100),
    targetDate: dateOnlySchema,
    actions: z.array(developmentActionSchema).min(1).max(100),
}).strict();

const validObjectiveWeights = (input: {
    objectives?: Array<z.infer<typeof developmentObjectiveSchema>>;
}): boolean => !input.objectives || Math.abs(input.objectives.reduce(
    (total, objective) => total + objective.weight, 0,
) - 100) < 0.001;

export const developmentPlanListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    employeeId: uuidSchema.optional(),
    managerEmployeeId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    status: developmentPlanStatusSchema.optional(),
}).strict();

export const createDevelopmentPlanSchema = z.object({
    employeeId: uuidSchema,
    managerEmployeeId: uuidSchema.optional(),
    evaluationAssignmentId: uuidSchema.nullable().optional(),
    targetCareerLevelId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(20_000),
    focusAreas: z.string().trim().min(10).max(20_000),
    status: z.enum(["draft", "active"]).default("draft"),
    startsOn: dateOnlySchema,
    targetEndOn: dateOnlySchema,
    objectives: z.array(developmentObjectiveSchema).min(1).max(100),
}).strict()
    .refine((input) => input.targetEndOn >= input.startsOn, {
        message: "A data final não pode ser anterior ao início.", path: ["targetEndOn"],
    })
    .refine(validObjectiveWeights, {
        message: "Os pesos dos objetivos devem somar 100.", path: ["objectives"],
    });

export const updateDevelopmentPlanSchema = z.object({
    managerEmployeeId: uuidSchema.optional(),
    targetCareerLevelId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(3).max(180).optional(),
    description: z.string().trim().min(20).max(20_000).optional(),
    focusAreas: z.string().trim().min(10).max(20_000).optional(),
    status: z.enum(["draft", "active", "cancelled"]).optional(),
    startsOn: dateOnlySchema.optional(),
    targetEndOn: dateOnlySchema.optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export const updateDevelopmentActionSchema = z.object({
    responsibleEmployeeId: uuidSchema.optional(),
    status: developmentItemStatusSchema.optional(),
    progressPercent: z.number().min(0).max(100).optional(),
    dueAt: z.iso.datetime({ offset: true }).optional(),
    employeeNotes: nullableText(10_000).optional(),
    managerNotes: nullableText(10_000).optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export const updateMyDevelopmentActionSchema = z.object({
    progressPercent: z.number().min(0).max(100),
    employeeNotes: nullableText(10_000).optional(),
}).strict();

export const myDevelopmentPlanListQuerySchema = z.object({
    ...paginationQueryShape,
    status: developmentPlanStatusSchema.optional(),
}).strict();

export type CareerTrackListQuery = z.infer<typeof careerTrackListQuerySchema>;
export type CreateCareerTrackInput = z.infer<typeof createCareerTrackSchema>;
export type UpdateCareerTrackInput = z.infer<typeof updateCareerTrackSchema>;
export type UpsertCareerProfileInput = z.infer<typeof upsertCareerProfileSchema>;
export type DevelopmentPlanListQuery = z.infer<typeof developmentPlanListQuerySchema>;
export type CreateDevelopmentPlanInput = z.infer<typeof createDevelopmentPlanSchema>;
export type UpdateDevelopmentPlanInput = z.infer<typeof updateDevelopmentPlanSchema>;
export type UpdateDevelopmentActionInput = z.infer<typeof updateDevelopmentActionSchema>;
export type UpdateMyDevelopmentActionInput = z.infer<typeof updateMyDevelopmentActionSchema>;
export type MyDevelopmentPlanListQuery = z.infer<typeof myDevelopmentPlanListQuerySchema>;
