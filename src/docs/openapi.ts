type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

interface EndpointDefinition {
    method: HttpMethod;
    path: string;
    tag: string;
    summary: string;
    public?: boolean;
}

const endpoints: EndpointDefinition[] = [
    { method: "get", path: "/", tag: "System", summary: "API information", public: true },
    { method: "get", path: "/live", tag: "System", summary: "Process liveness", public: true },
    { method: "get", path: "/ready", tag: "System", summary: "Dependency readiness", public: true },
    { method: "post", path: "/api/v1/auth/login", tag: "Authentication", summary: "Authenticate", public: true },
    { method: "post", path: "/api/v1/auth/refresh", tag: "Authentication", summary: "Rotate session", public: true },
    { method: "post", path: "/api/v1/auth/password/forgot", tag: "Authentication", summary: "Request password recovery", public: true },
    { method: "post", path: "/api/v1/auth/password/reset", tag: "Authentication", summary: "Reset password", public: true },
    { method: "post", path: "/api/v1/auth/activate", tag: "Authentication", summary: "Activate invited account", public: true },
    { method: "post", path: "/api/v1/auth/email/verify", tag: "Authentication", summary: "Verify e-mail", public: true },
    { method: "post", path: "/api/v1/auth/mfa/verify", tag: "Authentication", summary: "Complete MFA login", public: true },
    { method: "get", path: "/api/v1/auth/me", tag: "Authentication", summary: "Current account" },
    { method: "post", path: "/api/v1/auth/logout", tag: "Authentication", summary: "End current session" },
    { method: "post", path: "/api/v1/auth/logout-all", tag: "Authentication", summary: "End every session" },
    { method: "post", path: "/api/v1/auth/password/change", tag: "Authentication", summary: "Change own password" },
    { method: "get", path: "/api/v1/auth/sessions", tag: "Authentication", summary: "List active devices" },
    { method: "delete", path: "/api/v1/auth/sessions/{id}", tag: "Authentication", summary: "Revoke one device" },
    { method: "get", path: "/api/v1/auth/mfa", tag: "Authentication", summary: "MFA status" },
    { method: "post", path: "/api/v1/auth/mfa/setup", tag: "Authentication", summary: "Start MFA enrollment" },
    { method: "post", path: "/api/v1/auth/mfa/confirm", tag: "Authentication", summary: "Confirm MFA enrollment" },
    { method: "delete", path: "/api/v1/auth/mfa", tag: "Authentication", summary: "Disable MFA" },
    { method: "get", path: "/api/v1/dashboard", tag: "Dashboard", summary: "Dashboard indicators" },
    { method: "get", path: "/api/v1/companies/current", tag: "Organization", summary: "Current company" },
    { method: "patch", path: "/api/v1/companies/current", tag: "Organization", summary: "Update current company" },
    { method: "get", path: "/api/v1/departments", tag: "Organization", summary: "List departments" },
    { method: "post", path: "/api/v1/departments", tag: "Organization", summary: "Create department" },
    { method: "get", path: "/api/v1/departments/{id}", tag: "Organization", summary: "Get department" },
    { method: "patch", path: "/api/v1/departments/{id}", tag: "Organization", summary: "Update department" },
    { method: "delete", path: "/api/v1/departments/{id}", tag: "Organization", summary: "Archive department" },
    { method: "get", path: "/api/v1/positions", tag: "Organization", summary: "List positions" },
    { method: "post", path: "/api/v1/positions", tag: "Organization", summary: "Create position" },
    { method: "get", path: "/api/v1/positions/{id}", tag: "Organization", summary: "Get position" },
    { method: "patch", path: "/api/v1/positions/{id}", tag: "Organization", summary: "Update position" },
    { method: "delete", path: "/api/v1/positions/{id}", tag: "Organization", summary: "Archive position" },
    { method: "get", path: "/api/v1/employees", tag: "Employees", summary: "List employees" },
    { method: "post", path: "/api/v1/employees", tag: "Employees", summary: "Create employee" },
    { method: "get", path: "/api/v1/employees/me", tag: "Employees", summary: "Own employee profile" },
    { method: "get", path: "/api/v1/employees/{id}", tag: "Employees", summary: "Get employee" },
    { method: "patch", path: "/api/v1/employees/{id}", tag: "Employees", summary: "Update employee" },
    { method: "delete", path: "/api/v1/employees/{id}", tag: "Employees", summary: "Archive employee" },
    { method: "get", path: "/api/v1/users", tag: "Access", summary: "List accounts" },
    { method: "post", path: "/api/v1/users", tag: "Access", summary: "Create account invitation" },
    { method: "get", path: "/api/v1/users/roles", tag: "Access", summary: "List roles" },
    { method: "get", path: "/api/v1/users/permissions", tag: "Access", summary: "List permissions" },
    { method: "get", path: "/api/v1/users/{id}", tag: "Access", summary: "Get account" },
    { method: "patch", path: "/api/v1/users/{id}", tag: "Access", summary: "Update account access" },
    { method: "delete", path: "/api/v1/users/{id}", tag: "Access", summary: "Archive account" },
    { method: "get", path: "/api/v1/audit-logs", tag: "Audit", summary: "Search audit records" },
    { method: "get", path: "/api/v1/audit-logs/export", tag: "Audit", summary: "Export audit records" },
    { method: "get", path: "/api/v1/reports/employees", tag: "Reports", summary: "Export employee report" },
    { method: "get", path: "/api/v1/calendar/events", tag: "Calendar", summary: "List calendar events" },
    { method: "post", path: "/api/v1/calendar/events", tag: "Calendar", summary: "Create calendar event" },
    { method: "get", path: "/api/v1/recruitment/vacancies", tag: "Recruitment", summary: "List vacancies" },
    { method: "post", path: "/api/v1/recruitment/vacancies", tag: "Recruitment", summary: "Create vacancy" },
    { method: "get", path: "/api/v1/trainings", tag: "Training", summary: "List trainings" },
    { method: "post", path: "/api/v1/trainings", tag: "Training", summary: "Create training" },
    { method: "get", path: "/api/v1/journeys/templates", tag: "Journeys", summary: "List journey templates" },
    { method: "post", path: "/api/v1/journeys/templates", tag: "Journeys", summary: "Create journey template" },
    { method: "get", path: "/api/v1/evaluations/cycles", tag: "Evaluations", summary: "List evaluation cycles" },
    { method: "post", path: "/api/v1/evaluations/cycles", tag: "Evaluations", summary: "Create evaluation cycle" },
    { method: "get", path: "/api/v1/development/plans", tag: "Development", summary: "List development plans" },
    { method: "post", path: "/api/v1/development/plans", tag: "Development", summary: "Create development plan" },
    { method: "get", path: "/api/v1/notifications", tag: "Notifications", summary: "List notifications" },
    { method: "get", path: "/api/v1/notifications/summary", tag: "Notifications", summary: "Notification summary" },
];

const paths: Record<string, Record<string, unknown>> = {};
for (const endpoint of endpoints) {
    const parameters = [...endpoint.path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
        name: match[1],
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
    }));
    const mutation = ["post", "put", "patch"].includes(endpoint.method);
    paths[endpoint.path] ??= {};
    paths[endpoint.path][endpoint.method] = {
        tags: [endpoint.tag],
        summary: endpoint.summary,
        security: endpoint.public ? [] : [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: parameters.length ? parameters : undefined,
        requestBody: mutation ? {
            required: true,
            content: {
                "application/json": { schema: { type: "object", additionalProperties: true } },
            },
        } : undefined,
        responses: {
            "200": { description: "Success" },
            "204": { description: "Success without body" },
            "400": { $ref: "#/components/responses/BadRequest" },
            "401": { $ref: "#/components/responses/Unauthorized" },
            "403": { $ref: "#/components/responses/Forbidden" },
        },
    };
}

export const openApiDocument: Record<string, unknown> = {
    openapi: "3.1.0",
    info: {
        title: "RHumi API",
        version: "1.0.0",
        description: "API de gestão de pessoas com isolamento por empresa, RBAC e auditoria.",
    },
    servers: [{ url: "/", description: "Current server" }],
    paths,
    components: {
        securitySchemes: {
            bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
            cookieAuth: { type: "apiKey", in: "cookie", name: "access_token" },
        },
        schemas: {
            Error: {
                type: "object",
                required: ["error"],
                properties: {
                    error: {
                        type: "object",
                        required: ["code", "message"],
                        properties: {
                            code: { type: "string" },
                            message: { type: "string" },
                            requestId: { type: "string", format: "uuid" },
                            details: {},
                        },
                    },
                },
            },
        },
        responses: {
            BadRequest: {
                description: "Invalid request",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            Unauthorized: {
                description: "Authentication required",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
            Forbidden: {
                description: "Insufficient permission",
                content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
            },
        },
    },
};
