import { z } from "zod";
import {
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";
import { contractTypeSchema } from "./employees.schemas.js";

export const vacancyStatusSchema = z.enum(["draft", "open", "paused", "closed", "cancelled"]);
export const workModelSchema = z.enum(["onsite", "hybrid", "remote"]);
export const applicationStageSchema = z.enum([
    "applied",
    "screening",
    "interview",
    "assessment",
    "offer",
    "hired",
    "rejected",
]);
export const applicationStatusSchema = z.enum(["active", "withdrawn"]);

const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = (maximum: number) => z.string().trim().url().max(maximum).nullable();
const nullableDateTime = z.string().datetime({ offset: true }).nullable();
const nullableSalary = z.number().min(0).max(999_999_999_999.99).nullable();

const vacancyFields = {
    departmentId: uuidSchema,
    positionId: uuidSchema,
    title: z.string().trim().min(3).max(180),
    slug: z.string().trim().min(3).max(220)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido.")
        .optional(),
    description: z.string().trim().min(20).max(20_000),
    responsibilities: nullableText(10_000).optional(),
    requirements: nullableText(10_000).optional(),
    location: nullableText(180).optional(),
    contractType: contractTypeSchema,
    workModel: workModelSchema,
    status: vacancyStatusSchema,
    openings: z.number().int().min(1).max(10_000),
    salaryMin: nullableSalary.optional(),
    salaryMax: nullableSalary.optional(),
    publishedAt: nullableDateTime.optional(),
    closesAt: nullableDateTime.optional(),
};

const validSalaryRange = (input: { salaryMin?: number | null; salaryMax?: number | null }) => (
    input.salaryMin === undefined
    || input.salaryMin === null
    || input.salaryMax === undefined
    || input.salaryMax === null
    || input.salaryMax >= input.salaryMin
);

const validPublicationRange = (input: {
    publishedAt?: string | null;
    closesAt?: string | null;
}) => !input.publishedAt || !input.closesAt || input.closesAt >= input.publishedAt;

export const vacancyListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    positionId: uuidSchema.optional(),
    status: vacancyStatusSchema.optional(),
    contractType: contractTypeSchema.optional(),
    workModel: workModelSchema.optional(),
}).strict();

export const createVacancySchema = z.object({
    ...vacancyFields,
    status: vacancyStatusSchema.default("draft"),
    openings: z.number().int().min(1).max(10_000).default(1),
}).strict()
    .refine(validSalaryRange, { message: "O salário máximo deve ser maior ou igual ao mínimo.", path: ["salaryMax"] })
    .refine(validPublicationRange, { message: "O encerramento não pode ser anterior à publicação.", path: ["closesAt"] });

export const updateVacancySchema = z.object(vacancyFields)
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, { message: "Informe ao menos um campo para atualização." })
    .refine(validSalaryRange, { message: "O salário máximo deve ser maior ou igual ao mínimo.", path: ["salaryMax"] })
    .refine(validPublicationRange, { message: "O encerramento não pode ser anterior à publicação.", path: ["closesAt"] });

const candidateFields = {
    fullName: z.string().trim().min(3).max(180),
    email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    phone: nullableText(30).optional(),
    headline: nullableText(180).optional(),
    city: nullableText(120).optional(),
    state: nullableText(80).optional(),
    linkedinUrl: nullableUrl(500).optional(),
    resumeUrl: nullableUrl(1_000).optional(),
    source: nullableText(80).optional(),
    notes: nullableText(10_000).optional(),
};

export const candidateListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    vacancyId: uuidSchema.optional(),
    stage: applicationStageSchema.optional(),
    minScore: z.coerce.number().min(0).max(100).optional(),
    sortBy: z.enum(["createdAt", "fullName", "score"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
}).strict();

export const createCandidateSchema = z.object(candidateFields).strict();

export const updateCandidateSchema = z.object(candidateFields)
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, { message: "Informe ao menos um campo para atualização." });

export const applicationListQuerySchema = z.object({
    ...paginationQueryShape,
    vacancyId: uuidSchema.optional(),
    candidateId: uuidSchema.optional(),
    stage: applicationStageSchema.optional(),
    status: applicationStatusSchema.optional(),
}).strict();

export const createApplicationSchema = z.object({
    candidateId: uuidSchema,
    stage: applicationStageSchema.default("applied"),
    score: z.number().min(0).max(100).nullable().optional(),
    recruiterNotes: nullableText(10_000).optional(),
}).strict();

export const updateApplicationSchema = z.object({
    stage: applicationStageSchema.optional(),
    status: applicationStatusSchema.optional(),
    score: z.number().min(0).max(100).nullable().optional(),
    recruiterNotes: nullableText(10_000).optional(),
    stageNotes: z.string().trim().max(2_000).optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export type VacancyListQuery = z.infer<typeof vacancyListQuerySchema>;
export type CreateVacancyInput = z.infer<typeof createVacancySchema>;
export type UpdateVacancyInput = z.infer<typeof updateVacancySchema>;
export type CandidateListQuery = z.infer<typeof candidateListQuerySchema>;
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;
export type ApplicationListQuery = z.infer<typeof applicationListQuerySchema>;
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
