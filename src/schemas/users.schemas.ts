import { z } from "zod";
import {
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const userStatusSchema = z.enum(["active", "blocked", "inactive"]);
export const permissionEffectSchema = z.enum(["allow", "deny"]);

const accessCodeSchema = (minimum: number, maximum: number, message: string) => z
    .string()
    .trim()
    .min(minimum)
    .max(maximum)
    .transform((value) => value.toLowerCase())
    .pipe(z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, message));

const roleCodeSchema = accessCodeSchema(2, 80, "Código de perfil inválido.");
const permissionCodeSchema = accessCodeSchema(3, 120, "Código de permissão inválido.");

const uniqueStrings = (values: string[]): boolean => new Set(values).size === values.length;

const roleCodesSchema = z
    .array(roleCodeSchema)
    .min(1, "Informe ao menos um perfil de acesso.")
    .max(20)
    .refine(uniqueStrings, "Não repita perfis de acesso.");

const permissionOverridesSchema = z
    .array(z.object({
        permissionCode: permissionCodeSchema,
        effect: permissionEffectSchema,
    }).strict())
    .max(100)
    .refine(
        (overrides) => uniqueStrings(overrides.map((override) => override.permissionCode)),
        "Não repita permissões individuais.",
    );

export const userListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    status: userStatusSchema.optional(),
    roleCode: roleCodeSchema.optional(),
}).strict();

export const createUserSchema = z.object({
    employeeId: uuidSchema,
    password: z.string().min(12).max(128),
    roleCodes: roleCodesSchema,
    permissionOverrides: permissionOverridesSchema.default([]),
}).strict();

export const updateUserSchema = z.object({
    status: userStatusSchema.optional(),
    password: z.string().min(12).max(128).optional(),
    roleCodes: roleCodesSchema.optional(),
    permissionOverrides: permissionOverridesSchema.optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos um campo para atualização.",
});

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PermissionOverrideInput = z.infer<typeof permissionOverridesSchema>[number];
