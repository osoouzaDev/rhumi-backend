import { z } from "zod";
import { paginationQueryShape, uuidSchema } from "./common.schemas.js";

export const filePurposeSchema = z.string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_-]*$/, "A finalidade deve usar letras minúsculas, números, _ ou -.");

export const uploadFileFieldsSchema = z.object({
    purpose: filePurposeSchema,
    ownerEmployeeId: uuidSchema.optional(),
    retentionUntil: z.iso.datetime({ offset: true }).optional(),
}).strict().superRefine((input, context) => {
    if (input.retentionUntil && new Date(input.retentionUntil).getTime() <= Date.now()) {
        context.addIssue({
            code: "custom",
            message: "A retenção deve terminar em uma data futura.",
            path: ["retentionUntil"],
        });
    }
});

export const fileListQuerySchema = z.object({
    ...paginationQueryShape,
    ownerEmployeeId: uuidSchema.optional(),
    purpose: filePurposeSchema.optional(),
}).strict();

export const createFileLinkSchema = z.object({
    expiresInMinutes: z.number().int().min(1).max(10_080).optional(),
    maxDownloads: z.number().int().min(1).max(100).default(1),
}).strict();

export const fileTokenParameterSchema = z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{64}$/, "Token de arquivo inválido."),
});

export type UploadFileFields = z.infer<typeof uploadFileFieldsSchema>;
export type FileListQuery = z.infer<typeof fileListQuerySchema>;
export type CreateFileLinkInput = z.infer<typeof createFileLinkSchema>;
