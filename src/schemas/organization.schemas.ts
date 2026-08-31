import { z } from "zod";
import {
    dateOnlySchema,
    hasAtLeastOneDefinedValue,
    optionalBooleanQuerySchema,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

const nullableEmailSchema = z.string().trim().email().max(255).nullable();
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();

export const updateCompanySchema = z.object({
    legalName: z.string().trim().min(2).max(180).optional(),
    tradeName: nullableText(180).optional(),
    taxId: z.string().trim().min(5).max(20).optional(),
    email: nullableEmailSchema.optional(),
    phone: nullableText(30).optional(),
    addressLine: nullableText(255).optional(),
    city: nullableText(120).optional(),
    state: nullableText(80).optional(),
    postalCode: nullableText(20).optional(),
    foundedOn: dateOnlySchema.nullable().optional(),
    description: nullableText(5_000).optional(),
    careersHeadline: nullableText(180).optional(),
    careersDescription: nullableText(10_000).optional(),
    careersSlug: z
        .string()
        .trim()
        .min(3)
        .max(120)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "O slug deve usar letras minúsculas, números e hífens.")
        .nullable()
        .optional(),
    mission: nullableText(5_000).optional(),
    vision: nullableText(5_000).optional(),
    valuesText: nullableText(5_000).optional(),
    active: z.boolean().optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export const departmentListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(120).optional(),
    active: optionalBooleanQuerySchema,
}).strict();

export const createDepartmentSchema = z.object({
    name: z.string().trim().min(2).max(120),
    acronym: z.string().trim().min(1).max(20).nullable().optional(),
    icon: z.string().trim().min(1).max(80).nullable().optional(),
    active: z.boolean().default(true),
}).strict();

export const updateDepartmentSchema = createDepartmentSchema
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    });

export const positionListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(140).optional(),
    departmentId: uuidSchema.optional(),
    active: optionalBooleanQuerySchema,
}).strict();

export const createPositionSchema = z.object({
    departmentId: uuidSchema,
    title: z.string().trim().min(2).max(140),
    description: nullableText(5_000).optional(),
    baseSalary: z.number().min(0).max(999_999_999_999.99).nullable().optional(),
    active: z.boolean().default(true),
}).strict();

export const updatePositionSchema = createPositionSchema
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    });

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type DepartmentListQuery = z.infer<typeof departmentListQuerySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
export type PositionListQuery = z.infer<typeof positionListQuerySchema>;
export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;
