import { z } from "zod";
import { paginationQueryShape, uuidSchema } from "./common.schemas.js";

const auditFilters = {
    event: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    actorUserId: uuidSchema.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
};

const chronological = <T extends { from?: string; to?: string }>(input: T): boolean => (
    !input.from || !input.to || new Date(input.from) <= new Date(input.to)
);

export const auditListQuerySchema = z.object({
    ...paginationQueryShape,
    ...auditFilters,
}).strict().refine(chronological, {
    message: "O início do período deve ser anterior ao fim.",
    path: ["from"],
});

export const auditExportQuerySchema = z.object({
    ...auditFilters,
    format: z.enum(["csv", "xls", "pdf"]).default("csv"),
}).strict().refine(chronological, {
    message: "O início do período deve ser anterior ao fim.",
    path: ["from"],
});

export const reportExportQuerySchema = z.object({
    format: z.enum(["csv", "xls", "pdf"]).default("csv"),
    status: z.enum(["active", "on_leave", "inactive"]).optional(),
}).strict();

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
export type AuditExportQuery = z.infer<typeof auditExportQuerySchema>;
export type ReportExportQuery = z.infer<typeof reportExportQuerySchema>;
export type ExportFormat = AuditExportQuery["format"];
