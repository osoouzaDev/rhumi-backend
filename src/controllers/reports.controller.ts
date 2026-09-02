import type { Request, Response } from "express";
import { reportExportQuerySchema } from "../schemas/audit.schemas.js";
import { reportsService } from "../services/reports.service.js";
import { requireAuthenticationContext } from "../utils/request-auth.js";

export const exportEmployeesReport = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = reportExportQuerySchema.parse(request.query);
    const artifact = await reportsService.employees(context, query);
    response.setHeader("Content-Type", artifact.contentType);
    response.setHeader(
        "Content-Disposition",
        `attachment; filename="rhumi-employees.${artifact.extension}"`,
    );
    response.send(artifact.body);
};
