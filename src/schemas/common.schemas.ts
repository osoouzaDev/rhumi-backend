import { z } from "zod";

export const uuidSchema = z.string().uuid("Identificador inválido.");

export const idParameterSchema = z.object({
    id: uuidSchema,
});

export const dateOnlySchema = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "A data deve estar no formato AAAA-MM-DD.")
    .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return !Number.isNaN(date.getTime())
            && date.toISOString().slice(0, 10) === value;
    }, "Data inválida.");

export const optionalBooleanQuerySchema = z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional();

export const paginationQueryShape = {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const hasAtLeastOneDefinedValue = (value: Record<string, unknown>): boolean => (
    Object.values(value).some((field) => field !== undefined)
);
