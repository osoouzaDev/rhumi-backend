import { Router } from "express";
import { exportAuditLogs, listAuditLogs } from "../controllers/audit.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const auditRoutes = Router();

auditRoutes.use(authenticate);
auditRoutes.get("/export", authorize("audit.export"), exportAuditLogs);
auditRoutes.get("/", authorize("audit.read"), listAuditLogs);

export default auditRoutes;
