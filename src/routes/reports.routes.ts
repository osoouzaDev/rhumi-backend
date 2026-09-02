import { Router } from "express";
import { exportEmployeesReport } from "../controllers/reports.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const reportsRoutes = Router();

reportsRoutes.use(authenticate, authorize("reports.export"));
reportsRoutes.get("/employees", exportEmployeesReport);

export default reportsRoutes;
