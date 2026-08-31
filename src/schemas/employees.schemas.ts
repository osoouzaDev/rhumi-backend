import { z } from "zod";
import {
    dateOnlySchema,
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const contractTypeSchema = z.enum(["clt", "pj"]);
export const employeeStatusSchema = z.enum(["active", "on_leave", "inactive"]);

const employeeFields = {
    departmentId: uuidSchema,
    positionId: uuidSchema,
    employeeCode: z.string().trim().min(1).max(50),
    fullName: z.string().trim().min(3).max(180),
    email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    phone: z.string().trim().min(3).max(30).nullable().optional(),
    contractType: contractTypeSchema,
    status: employeeStatusSchema,
    admissionDate: dateOnlySchema,
    terminationDate: dateOnlySchema.nullable().optional(),
};

const validEmploymentDates = (input: {
    admissionDate?: string;
    terminationDate?: string | null;
}): boolean => !input.admissionDate
    || !input.terminationDate
    || input.terminationDate >= input.admissionDate;

export const employeeListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    positionId: uuidSchema.optional(),
    status: employeeStatusSchema.optional(),
    contractType: contractTypeSchema.optional(),
    sortBy: z.enum(["fullName", "admissionDate", "createdAt"]).default("fullName"),
    sortOrder: z.enum(["asc", "desc"]).default("asc"),
}).strict();

export const createEmployeeSchema = z.object({
    ...employeeFields,
    status: employeeStatusSchema.default("active"),
}).strict().refine(validEmploymentDates, {
    message: "A data de desligamento não pode ser anterior à admissão.",
    path: ["terminationDate"],
});

export const updateEmployeeSchema = z.object(employeeFields)
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    });

export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
