import { Router } from "express";
import { getDashboard } from "../controllers/dashboard.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const dashboardRoutes = Router();

dashboardRoutes.get("/", authenticate, authorize("dashboard.read"), getDashboard);

export default dashboardRoutes;
