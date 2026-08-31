import { z } from "zod";
import {
    dateOnlySchema,
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const journeyKindSchema = z.enum([
    "onboarding", "offboarding", "development", "custom",
]);
export const journeyTemplateStatusSchema = z.enum(["draft", "published", "archived"]);
export const journeyAssignmentStatusSchema = z.enum([
    "planned", "in_progress", "completed", "overdue", "cancelled",
]);
export const journeyTaskTypeSchema = z.enum(["manual", "training", "meeting", "document"]);
export const journeyTaskResponsibleSchema = z.enum(["collaborator", "owner"]);
export const journeyTaskStatusSchema = z.enum([
    "pending", "in_progress", "completed", "skipped", "blocked",
]);

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = z.string().trim().url().max(1_000).nullable();
const meetingTimeSchema = z.string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "O horário deve estar no formato HH:MM.");

const templateTaskSchema = z.object({
    title: z.string().trim().min(3).max(180),
    description: nullableText(10_000).optional(),
    taskType: journeyTaskTypeSchema.default("manual"),
    responsible: journeyTaskResponsibleSchema.default("collaborator"),
    required: z.boolean().default(true),
    dueAfterDays: z.number().int().min(0).max(10_000),
    trainingId: uuidSchema.nullable().optional(),
    meetingTime: meetingTimeSchema.nullable().optional(),
    meetingDurationMinutes: z.number().int().min(1).max(1_440).nullable().optional(),
    resourceUrl: nullableUrl.optional(),
}).strict().superRefine((task, context) => {
    if (task.taskType === "training" && !task.trainingId) {
        context.addIssue({ code: "custom",
            message: "Tarefas de treinamento exigem um treinamento vinculado.",
            path: ["trainingId"] });
    }
    if (task.taskType === "meeting" && (!task.meetingTime || !task.meetingDurationMinutes)) {
        context.addIssue({ code: "custom",
            message: "Tarefas de reunião exigem horário e duração.",
            path: ["meetingTime"] });
    }
});

const templateStageSchema = z.object({
    name: z.string().trim().min(2).max(180),
    description: nullableText(10_000).optional(),
    startsAfterDays: z.number().int().min(0).max(10_000).default(0),
    tasks: z.array(templateTaskSchema).min(1).max(100),
}).strict().superRefine((stage, context) => {
    stage.tasks.forEach((task, index) => {
        if (task.dueAfterDays < stage.startsAfterDays) {
            context.addIssue({ code: "custom",
                message: "O prazo da tarefa não pode ser anterior ao início da fase.",
                path: ["tasks", index, "dueAfterDays"] });
        }
    });
});

const templateFields = {
    departmentId: uuidSchema.nullable().optional(),
    code: z.string().trim().min(2).max(60)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido."),
    name: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(20_000),
    kind: journeyKindSchema,
    durationDays: z.number().int().min(1).max(10_000),
    status: journeyTemplateStatusSchema,
    stages: z.array(templateStageSchema).min(1).max(100),
};

const validTemplateDuration = (input: {
    durationDays?: number;
    stages?: Array<z.infer<typeof templateStageSchema>>;
}): boolean => {
    const { durationDays, stages } = input;
    if (durationDays === undefined || stages === undefined) return true;
    return stages.every((stage) => stage.startsAfterDays <= durationDays
        && stage.tasks.every((task) => task.dueAfterDays <= durationDays));
};

export const journeyTemplateListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    kind: journeyKindSchema.optional(),
    status: journeyTemplateStatusSchema.optional(),
}).strict();

export const createJourneyTemplateSchema = z.object({
    ...templateFields,
    status: journeyTemplateStatusSchema.default("draft"),
}).strict().refine(validTemplateDuration, {
    message: "Fases e tarefas precisam estar dentro da duração da jornada.",
    path: ["durationDays"],
});

export const updateJourneyTemplateSchema = z.object(templateFields)
    .partial().strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    })
    .refine(validTemplateDuration, {
        message: "Fases e tarefas precisam estar dentro da duração da jornada.",
        path: ["durationDays"],
    });

export const journeyAssignmentListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    templateId: uuidSchema.optional(),
    employeeId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    status: journeyAssignmentStatusSchema.optional(),
}).strict();

export const createJourneyAssignmentSchema = z.object({
    templateId: uuidSchema,
    employeeId: uuidSchema,
    ownerEmployeeId: uuidSchema.optional(),
    startsOn: dateOnlySchema.optional(),
    notes: nullableText(10_000).optional(),
}).strict();

export const updateJourneyAssignmentSchema = z.object({
    ownerEmployeeId: uuidSchema.optional(),
    status: z.enum(["in_progress", "cancelled"]).optional(),
    targetEndOn: dateOnlySchema.optional(),
    notes: nullableText(10_000).optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

const taskUpdateFields = {
    status: journeyTaskStatusSchema.optional(),
    responsibleEmployeeId: uuidSchema.optional(),
    evidenceUrl: nullableUrl.optional(),
    notes: nullableText(10_000).optional(),
};

export const updateJourneyTaskSchema = z.object(taskUpdateFields)
    .strict().refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    });

export const updateMyJourneyTaskSchema = z.object({
    status: z.enum(["in_progress", "completed", "blocked"]).optional(),
    evidenceUrl: nullableUrl.optional(),
    notes: nullableText(10_000).optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export const myJourneyListQuerySchema = z.object({
    ...paginationQueryShape,
    status: journeyAssignmentStatusSchema.optional(),
}).strict();

export type JourneyTemplateListQuery = z.infer<typeof journeyTemplateListQuerySchema>;
export type CreateJourneyTemplateInput = z.infer<typeof createJourneyTemplateSchema>;
export type UpdateJourneyTemplateInput = z.infer<typeof updateJourneyTemplateSchema>;
export type JourneyAssignmentListQuery = z.infer<typeof journeyAssignmentListQuerySchema>;
export type CreateJourneyAssignmentInput = z.infer<typeof createJourneyAssignmentSchema>;
export type UpdateJourneyAssignmentInput = z.infer<typeof updateJourneyAssignmentSchema>;
export type UpdateJourneyTaskInput = z.infer<typeof updateJourneyTaskSchema>;
export type UpdateMyJourneyTaskInput = z.infer<typeof updateMyJourneyTaskSchema>;
export type MyJourneyListQuery = z.infer<typeof myJourneyListQuerySchema>;
