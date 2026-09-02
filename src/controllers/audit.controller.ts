import type { Request, Response } from "express";
import { auditExportQuerySchema, auditListQuerySchema } from "../schemas/audit.schemas.js";
import { auditService } from "../services/audit.service.js";
import { requireAuthenticationContext } from "../utils/request-auth.js";

export const listAuditLogs = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = auditListQuerySchema.parse(request.query);
    const result = await auditService.list(context, query);
    response.json({
        data: { auditLogs: result.items },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const exportAuditLogs = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = auditExportQuerySchema.parse(request.query);
    const artifact = await auditService.export(context, query);
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader(
        "Content-Disposition",
        `attachment; filename="rhumi-audit.${artifact.extension}"`,
    );
    response.send(artifact.body);
};
