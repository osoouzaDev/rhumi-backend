import type { Request, Response } from "express";
import { dashboardService } from "../services/dashboard.service.js";
import { requireAuthenticationContext } from "../utils/request-auth.js";

export const getDashboard = async (request: Request, response: Response): Promise<void> => {
    const dashboard = await dashboardService.getDashboard(
        requireAuthenticationContext(request),
    );
    response.json({ data: { dashboard } });
};
