import cors from "cors";
import express from "express";
import { corsOrigins, env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware.js";
import { attachRequestContext } from "./middlewares/request-context.middleware.js";
import { observeRequest } from "./middlewares/observability.middleware.js";
import {
    liveness,
    metrics,
    readiness,
} from "./controllers/operations.controller.js";
import {
    enforceTrustedOrigin,
    globalRateLimiter,
    preventSensitiveCaching,
    requireHttps,
    securityHeaders,
} from "./middlewares/security.middleware.js";
import authRoutes from "./routes/auth.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import calendarRoutes from "./routes/calendar.routes.js";
import companiesRoutes from "./routes/companies.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import departmentsRoutes from "./routes/departments.routes.js";
import developmentRoutes from "./routes/development.routes.js";
import docsRoutes from "./routes/docs.routes.js";
import employeesRoutes from "./routes/employees.routes.js";
import evaluationsRoutes from "./routes/evaluations.routes.js";
import filesRoutes from "./routes/files.routes.js";
import journeysRoutes from "./routes/journeys.routes.js";
import notificationsRoutes from "./routes/notifications.routes.js";
import positionsRoutes from "./routes/positions.routes.js";
import privacyRoutes from "./routes/privacy.routes.js";
import recruitmentRoutes from "./routes/recruitment.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import trainingsRoutes from "./routes/trainings.routes.js";
import usersRoutes from "./routes/users.routes.js";

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", env.TRUST_PROXY_HOPS);
app.use(attachRequestContext);
app.use(observeRequest);
app.use(securityHeaders);
app.use(requireHttps);
app.use(globalRateLimiter);
app.use(cors({
    credentials: true,
    origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(null, false);
    },
}));
app.use(enforceTrustedOrigin);
app.use(express.json({ limit: "1mb" }));
app.use("/api/v1", preventSensitiveCaching);

app.get("/", (_request, response) => {
    response.json({
        name: "RHumi API",
        status: "running",
        version: "v1",
    });
});

app.get("/live", liveness);
app.get("/ready", readiness);
app.get("/health", readiness);
app.get("/metrics", metrics);
app.use("/docs", docsRoutes);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/audit-logs", auditRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/calendar", calendarRoutes);
app.use("/api/v1/companies", companiesRoutes);
app.use("/api/v1/departments", departmentsRoutes);
app.use("/api/v1/development", developmentRoutes);
app.use("/api/v1/positions", positionsRoutes);
app.use("/api/v1/recruitment", recruitmentRoutes);
app.use("/api/v1/reports", reportsRoutes);
app.use("/api/v1/trainings", trainingsRoutes);
app.use("/api/v1/journeys", journeysRoutes);
app.use("/api/v1/evaluations", evaluationsRoutes);
app.use("/api/v1/files", filesRoutes);
app.use("/api/v1/notifications", notificationsRoutes);
app.use("/api/v1/privacy", privacyRoutes);
app.use("/api/v1/employees", employeesRoutes);
app.use("/api/v1/users", usersRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
