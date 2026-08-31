import { z } from "zod";
import {
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const notificationTypeSchema = z.enum([
    "journey", "training", "calendar", "evaluation", "development",
    "recruitment", "announcement", "system",
]);
export const notificationPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export const notificationDigestFrequencySchema = z.enum([
    "immediate", "daily", "weekly", "off",
]);
export const notificationAudienceTypeSchema = z.enum(["company", "department", "employees"]);

const booleanQuerySchema = z.enum(["true", "false"])
    .transform((value) => value === "true");
const timeSchema = z.string().regex(
    /^([01]\d|2[0-3]):[0-5]\d$/,
    "O horário deve estar no formato HH:mm.",
);
const nullableUrlSchema = z.string().trim().url().max(1_000).nullable();

export const notificationListQuerySchema = z.object({
    ...paginationQueryShape,
    search: z.string().trim().max(180).optional(),
    type: notificationTypeSchema.optional(),
    priority: notificationPrioritySchema.optional(),
    status: z.enum(["all", "unread", "read"]).default("all"),
    includeResolved: booleanQuerySchema.default(false),
    dueBefore: z.iso.datetime({ offset: true }).optional(),
}).strict();

export const updateNotificationPreferencesSchema = z.object({
    inAppEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    digestFrequency: notificationDigestFrequencySchema.optional(),
    reminderDays: z.array(z.number().int().min(0).max(365)).max(30)
        .refine((items) => new Set(items).size === items.length,
            "Os dias de lembrete não podem se repetir.")
        .optional(),
    notifyLowPriority: z.boolean().optional(),
    quietHoursStart: timeSchema.nullable().optional(),
    quietHoursEnd: timeSchema.nullable().optional(),
    timezone: z.string().trim().min(3).max(100).optional(),
}).strict().refine(hasAtLeastOneDefinedValue, {
    message: "Informe ao menos uma preferência para atualização.",
}).superRefine((input, context) => {
    if ((input.quietHoursStart === null) !== (input.quietHoursEnd === null)
        && input.quietHoursStart !== undefined && input.quietHoursEnd !== undefined) {
        context.addIssue({
            code: "custom",
            message: "Informe o início e o fim do horário silencioso.",
            path: ["quietHoursEnd"],
        });
    }
});

export const createNotificationAnnouncementSchema = z.object({
    audienceType: notificationAudienceTypeSchema,
    departmentId: uuidSchema.nullable().optional(),
    employeeIds: z.array(uuidSchema).max(1_000).default([])
        .refine((items) => new Set(items).size === items.length,
            "O mesmo colaborador não pode aparecer mais de uma vez."),
    title: z.string().trim().min(3).max(180),
    description: z.string().trim().min(10).max(20_000),
    priority: notificationPrioritySchema.default("normal"),
    actionUrl: nullableUrlSchema.optional(),
    expiresAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict().superRefine((input, context) => {
    if (input.audienceType === "department" && !input.departmentId) {
        context.addIssue({
            code: "custom", message: "Informe o setor do comunicado.", path: ["departmentId"],
        });
    }
    if (input.audienceType === "employees" && input.employeeIds.length === 0) {
        context.addIssue({
            code: "custom", message: "Informe ao menos um destinatário.", path: ["employeeIds"],
        });
    }
    if (input.audienceType !== "employees" && input.employeeIds.length > 0) {
        context.addIssue({
            code: "custom",
            message: "Destinatários individuais só podem ser usados no público employees.",
            path: ["employeeIds"],
        });
    }
});

export type NotificationListQuery = z.infer<typeof notificationListQuerySchema>;
export type UpdateNotificationPreferencesInput = z.infer<
    typeof updateNotificationPreferencesSchema
>;
export type CreateNotificationAnnouncementInput = z.infer<
    typeof createNotificationAnnouncementSchema
>;
