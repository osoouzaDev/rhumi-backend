import { z } from "zod";
import {
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const trainingModalitySchema = z.enum(["online", "in_person", "hybrid"]);
export const trainingStatusSchema = z.enum(["draft", "published", "archived"]);
export const trainingClassStatusSchema = z.enum([
    "draft", "open", "in_progress", "completed", "cancelled",
]);
export const trainingEnrollmentStatusSchema = z.enum([
    "assigned", "in_progress", "completed", "failed", "cancelled",
]);
export const trainingQuestionTypeSchema = z.enum([
    "single_choice", "multiple_choice", "true_false",
]);
export const trainingMaterialTypeSchema = z.enum(["video", "document", "link", "text"]);

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = z.string().trim().url().max(1_000).nullable();
const dateTimeSchema = z.string().datetime({ offset: true });

export const trainingMaterialSchema = z.object({
    title: z.string().trim().min(2).max(180),
    type: trainingMaterialTypeSchema,
    url: nullableUrl.optional(),
    content: nullableText(30_000).optional(),
}).strict().refine(
    (material) => material.type === "text" ? Boolean(material.content) : Boolean(material.url),
    { message: "Informe o conteúdo textual ou a URL do material." },
);

const trainingFields = {
    departmentId: uuidSchema.nullable().optional(),
    code: z.string().trim().min(2).max(60)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, "Código inválido."),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(20).max(20_000),
    objectives: nullableText(10_000).optional(),
    instructor: nullableText(180).optional(),
    modality: trainingModalitySchema,
    workloadMinutes: z.number().int().min(1).max(1_000_000),
    coverUrl: nullableUrl.optional(),
    materials: z.array(trainingMaterialSchema).max(100),
    status: trainingStatusSchema,
};

export const trainingListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    modality: trainingModalitySchema.optional(),
    status: trainingStatusSchema.optional(),
}).strict();

export const createTrainingSchema = z.object({
    ...trainingFields,
    materials: z.array(trainingMaterialSchema).max(100).default([]),
    status: trainingStatusSchema.default("draft"),
}).strict();

export const updateTrainingSchema = z.object(trainingFields)
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    });

const validClassRange = (input: {
    startsAt?: string;
    endsAt?: string;
    enrollmentDeadline?: string | null;
}): boolean => (
    !input.startsAt
    || !input.endsAt
    || new Date(input.endsAt).getTime() > new Date(input.startsAt).getTime()
);

const validEnrollmentDeadline = (input: {
    startsAt?: string;
    enrollmentDeadline?: string | null;
}): boolean => (
    !input.startsAt
    || !input.enrollmentDeadline
    || new Date(input.enrollmentDeadline).getTime() <= new Date(input.startsAt).getTime()
);

const classFields = {
    departmentId: uuidSchema.nullable().optional(),
    name: z.string().trim().min(2).max(180),
    status: trainingClassStatusSchema,
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
    enrollmentDeadline: dateTimeSchema.nullable().optional(),
    capacity: z.number().int().min(1).max(100_000).nullable().optional(),
    location: nullableText(255).optional(),
    meetingUrl: nullableUrl.optional(),
};

export const createTrainingClassSchema = z.object({
    ...classFields,
    status: trainingClassStatusSchema.default("draft"),
}).strict()
    .refine(validClassRange, {
        message: "O término da turma deve ser posterior ao início.",
        path: ["endsAt"],
    })
    .refine(validEnrollmentDeadline, {
        message: "O prazo de inscrição não pode ser posterior ao início.",
        path: ["enrollmentDeadline"],
    });

export const updateTrainingClassSchema = z.object(classFields)
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    })
    .refine(validClassRange, {
        message: "O término da turma deve ser posterior ao início.",
        path: ["endsAt"],
    })
    .refine(validEnrollmentDeadline, {
        message: "O prazo de inscrição não pode ser posterior ao início.",
        path: ["enrollmentDeadline"],
    });

export const trainingClassListQuerySchema = z.object({
    ...paginationQueryShape,
    trainingId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    status: trainingClassStatusSchema.optional(),
    from: dateTimeSchema.optional(),
    to: dateTimeSchema.optional(),
}).strict().refine(
    (input) => !input.from || !input.to
        || new Date(input.to).getTime() > new Date(input.from).getTime(),
    { message: "O fim do período deve ser posterior ao início.", path: ["to"] },
);

export const assignTrainingEnrollmentsSchema = z.object({
    employeeIds: z.array(uuidSchema).min(1).max(500)
        .refine((ids) => new Set(ids).size === ids.length, "Não repita colaboradores."),
}).strict();

export const trainingEnrollmentListQuerySchema = z.object({
    ...paginationQueryShape,
    status: trainingEnrollmentStatusSchema.optional(),
    employeeId: uuidSchema.optional(),
}).strict();

export const myTrainingListQuerySchema = z.object({
    ...paginationQueryShape,
    status: trainingEnrollmentStatusSchema.optional(),
}).strict();

export const updateTrainingProgressSchema = z.object({
    progressPercent: z.number().min(0).max(100),
}).strict();

const examOptionSchema = z.object({
    text: z.string().trim().min(1).max(2_000),
    isCorrect: z.boolean(),
}).strict();

const examQuestionSchema = z.object({
    prompt: z.string().trim().min(3).max(10_000),
    questionType: trainingQuestionTypeSchema,
    points: z.number().min(0.01).max(1_000).default(1),
    options: z.array(examOptionSchema).min(2).max(20),
}).strict().superRefine((question, context) => {
    const correct = question.options.filter((option) => option.isCorrect).length;
    if (question.questionType === "multiple_choice" ? correct < 1 : correct !== 1) {
        context.addIssue({
            code: "custom",
            message: question.questionType === "multiple_choice"
                ? "A questão deve possuir ao menos uma alternativa correta."
                : "A questão deve possuir exatamente uma alternativa correta.",
            path: ["options"],
        });
    }
    if (question.questionType === "true_false" && question.options.length !== 2) {
        context.addIssue({
            code: "custom",
            message: "Questões de verdadeiro ou falso devem possuir duas alternativas.",
            path: ["options"],
        });
    }
});

export const upsertTrainingExamSchema = z.object({
    title: z.string().trim().min(3).max(180),
    instructions: nullableText(20_000).optional(),
    passingScore: z.number().min(0).max(100).default(70),
    maxAttempts: z.number().int().min(1).max(100).default(3),
    timeLimitMinutes: z.number().int().min(1).max(10_000).nullable().optional(),
    published: z.boolean().default(false),
    questions: z.array(examQuestionSchema).min(1).max(100),
}).strict();

export const submitTrainingExamSchema = z.object({
    answers: z.array(z.object({
        questionId: uuidSchema,
        selectedOptionIds: z.array(uuidSchema).min(1).max(20)
            .refine((ids) => new Set(ids).size === ids.length, "Não repita alternativas."),
    }).strict()).min(1).max(100)
        .refine(
            (answers) => new Set(answers.map((answer) => answer.questionId)).size === answers.length,
            "Não repita questões.",
        ),
}).strict();

export type TrainingListQuery = z.infer<typeof trainingListQuerySchema>;
export type CreateTrainingInput = z.infer<typeof createTrainingSchema>;
export type UpdateTrainingInput = z.infer<typeof updateTrainingSchema>;
export type TrainingClassListQuery = z.infer<typeof trainingClassListQuerySchema>;
export type CreateTrainingClassInput = z.infer<typeof createTrainingClassSchema>;
export type UpdateTrainingClassInput = z.infer<typeof updateTrainingClassSchema>;
export type AssignTrainingEnrollmentsInput = z.infer<typeof assignTrainingEnrollmentsSchema>;
export type TrainingEnrollmentListQuery = z.infer<typeof trainingEnrollmentListQuerySchema>;
export type MyTrainingListQuery = z.infer<typeof myTrainingListQuerySchema>;
export type UpdateTrainingProgressInput = z.infer<typeof updateTrainingProgressSchema>;
export type UpsertTrainingExamInput = z.infer<typeof upsertTrainingExamSchema>;
export type SubmitTrainingExamInput = z.infer<typeof submitTrainingExamSchema>;
