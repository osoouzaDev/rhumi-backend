import "dotenv/config";
import { z } from "zod";

const optionalString = z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().optional(),
);

const booleanFromString = (defaultValue: boolean) => z
    .enum(["true", "false"])
    .default(String(defaultValue) as "true" | "false")
    .transform((value) => value === "true");

const environmentSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8_000),
    CORS_ORIGINS: z.string().trim().default("http://localhost:3000"),
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
    FORCE_HTTPS: booleanFromString(false),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(30_000),
    HEADERS_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    SERVICE_NAME: z.string().trim().min(1).max(80).default("rhumi-api"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    METRICS_ENABLED: booleanFromString(true),
    METRICS_TOKEN: optionalString,

    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    REFRESH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
    ACCOUNT_RECOVERY_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    ACCOUNT_RECOVERY_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    RATE_LIMIT_STORE: z.enum(["memory", "redis"]).default("memory"),
    REDIS_URL: optionalString,
    REDIS_KEY_PREFIX: z.string().trim().min(1).max(100).default("rhumi:rate-limit:"),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),

    DATABASE_URL: optionalString,
    DB_HOST: optionalString,
    DB_PORT: z.coerce.number().int().min(1).max(65_535).default(5_432),
    DB_USER: optionalString,
    DB_PASSWORD: optionalString,
    DB_NAME: optionalString,
    DB_SSL: booleanFromString(false),
    DB_SSL_REJECT_UNAUTHORIZED: booleanFromString(true),
    DB_SSL_CA_PATH: optionalString,
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    DATABASE_MIGRATION_URL: optionalString,
    DB_MIGRATION_USER: optionalString,
    DB_MIGRATION_PASSWORD: optionalString,

    JWT_SECRET: z.string().min(32),
    JWT_PREVIOUS_SECRET: z.preprocess(
        (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
        z.string().min(32).optional(),
    ),
    JWT_ISSUER: z.string().trim().min(1),
    JWT_AUDIENCE: z.string().trim().min(1),
    ACCESS_TOKEN_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).default(900),
    REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().min(1).default(7),
    ACCESS_TOKEN_COOKIE_NAME: z.string().trim().min(1).default("access_token"),
    REFRESH_TOKEN_COOKIE_NAME: z.string().trim().min(1).default("refresh_token"),
    AUTH_COOKIES_ENABLED: booleanFromString(true),
    AUTH_COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
    AUTH_EXPOSE_TOKENS_IN_BODY: booleanFromString(true),
    AUTH_MAX_ACTIVE_SESSIONS: z.coerce.number().int().min(1).max(100).default(10),
    ACCOUNT_TOKENS_EXPOSE_IN_RESPONSE: booleanFromString(false),
    ACCOUNT_ACTIVATION_EXPIRES_IN_HOURS: z.coerce.number().int().min(1).max(720).default(72),
    PASSWORD_RESET_EXPIRES_IN_MINUTES: z.coerce.number().int().min(5).max(1440).default(30),
    EMAIL_VERIFICATION_EXPIRES_IN_HOURS: z.coerce.number().int().min(1).max(168).default(24),
    PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

    MFA_ENABLED: booleanFromString(false),
    MFA_REQUIRE_ADMINISTRATORS: booleanFromString(false),
    MFA_ENCRYPTION_KEY: optionalString,
    MFA_ISSUER: z.string().trim().min(1).max(80).default("RHumi"),
    MFA_CHALLENGE_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    MFA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    MFA_RECOVERY_CODE_COUNT: z.coerce.number().int().min(5).max(20).default(10),

    EMAIL_DELIVERY_ENABLED: booleanFromString(false),
    SMTP_HOST: optionalString,
    SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
    SMTP_SECURE: booleanFromString(false),
    SMTP_REJECT_UNAUTHORIZED: booleanFromString(true),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    EMAIL_FROM_ADDRESS: optionalString,
    EMAIL_FROM_NAME: z.string().trim().min(1).max(120).default("RHumi"),
    EMAIL_WORKER_INTERVAL_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
    EMAIL_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(100).default(20),
    EMAIL_LOCK_TIMEOUT_MINUTES: z.coerce.number().int().min(1).max(120).default(15),
    NOTIFICATION_AUTOMATION_ENABLED: booleanFromString(false),
    NOTIFICATION_AUTOMATION_INTERVAL_MS: z.coerce.number().int().min(10_000).max(3_600_000).default(60_000),

    FILE_STORAGE_PATH: z.string().trim().min(1).default("./var/private-files"),
    FILE_MAX_BYTES: z.coerce.number().int().min(1_024).max(104_857_600).default(20_971_520),
    FILE_ALLOWED_MIME_TYPES: z.string().trim().min(1).default(
        "application/pdf,image/jpeg,image/png,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ),
    FILE_DOWNLOAD_TOKEN_EXPIRES_IN_MINUTES: z.coerce.number().int().min(1).max(10_080).default(30),
    FILE_ANTIVIRUS_ENABLED: booleanFromString(false),
    CLAMAV_HOST: z.string().trim().min(1).default("127.0.0.1"),
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3_310),
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
    FILE_RETENTION_CLEANUP_ENABLED: booleanFromString(true),
    FILE_RETENTION_CLEANUP_INTERVAL_MS: z.coerce.number().int().min(60_000).max(86_400_000).default(3_600_000),

    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
}).superRefine((environment, context) => {
    if (!environment.DATABASE_URL) {
        const requiredDatabaseVariables = [
            ["DB_HOST", environment.DB_HOST],
            ["DB_USER", environment.DB_USER],
            ["DB_PASSWORD", environment.DB_PASSWORD],
            ["DB_NAME", environment.DB_NAME],
        ] as const;
        for (const [name, value] of requiredDatabaseVariables) {
            if (!value) {
                context.addIssue({
                    code: "custom",
                    message: `${name} deve ser definido quando DATABASE_URL não for utilizada.`,
                    path: [name],
                });
            }
        }
    }

    if (environment.RATE_LIMIT_STORE === "redis" && !environment.REDIS_URL) {
        context.addIssue({
            code: "custom",
            message: "REDIS_URL deve ser definida quando RATE_LIMIT_STORE=redis.",
            path: ["REDIS_URL"],
        });
    }

    if (environment.MFA_ENABLED) {
        const key = environment.MFA_ENCRYPTION_KEY;
        const keyIsValid = Boolean(
            key
            && /^[A-Za-z0-9+/]+={0,2}$/.test(key)
            && Buffer.from(key, "base64").length === 32
        );
        if (!keyIsValid) {
            context.addIssue({
                code: "custom",
                message: "MFA_ENCRYPTION_KEY deve ser uma chave aleatória de 32 bytes em Base64.",
                path: ["MFA_ENCRYPTION_KEY"],
            });
        }
    }

    const hasSmtpUser = Boolean(environment.SMTP_USER);
    const hasSmtpPassword = Boolean(environment.SMTP_PASSWORD);
    if (hasSmtpUser !== hasSmtpPassword) {
        context.addIssue({
            code: "custom",
            message: "SMTP_USER and SMTP_PASSWORD must be defined together.",
            path: ["SMTP_USER"],
        });
    }
    if (environment.EMAIL_DELIVERY_ENABLED
        && (!environment.SMTP_HOST || !environment.EMAIL_FROM_ADDRESS)) {
        context.addIssue({
            code: "custom",
            message: "SMTP_HOST and EMAIL_FROM_ADDRESS are required for e-mail delivery.",
            path: ["EMAIL_DELIVERY_ENABLED"],
        });
    }

    const hasMigrationUser = Boolean(environment.DB_MIGRATION_USER);
    const hasMigrationPassword = Boolean(environment.DB_MIGRATION_PASSWORD);
    if (hasMigrationUser !== hasMigrationPassword) {
        context.addIssue({
            code: "custom",
            message: "DB_MIGRATION_USER e DB_MIGRATION_PASSWORD devem ser definidos em conjunto.",
            path: ["DB_MIGRATION_USER"],
        });
    }

    const origins = environment.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
    for (const origin of origins) {
        try {
            const parsed = new URL(origin);
            if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
                throw new Error();
            }
        } catch {
            context.addIssue({
                code: "custom",
                message: `Origem CORS inválida: ${origin}`,
                path: ["CORS_ORIGINS"],
            });
        }
    }

    if (environment.AUTH_COOKIE_SAME_SITE === "none" && environment.NODE_ENV !== "production") {
        context.addIssue({
            code: "custom",
            message: "SameSite=None exige cookies Secure e NODE_ENV=production.",
            path: ["AUTH_COOKIE_SAME_SITE"],
        });
    }

    if (environment.NODE_ENV === "production") {
        if (origins.length === 0 || origins.some((origin) => (
            !origin.startsWith("https://")
            || /localhost|127\.0\.0\.1/i.test(origin)
        ))) {
            context.addIssue({
                code: "custom",
                message: "Em produção, CORS_ORIGINS deve conter somente origens HTTPS explícitas.",
                path: ["CORS_ORIGINS"],
            });
        }
        if (environment.JWT_SECRET.length < 48
            || /replace|change|example|secret/i.test(environment.JWT_SECRET)) {
            context.addIssue({
                code: "custom",
                message: "Em produção, JWT_SECRET deve ter ao menos 48 caracteres não previsíveis.",
                path: ["JWT_SECRET"],
            });
        }
        if (environment.JWT_PREVIOUS_SECRET && (
            environment.JWT_PREVIOUS_SECRET.length < 48
            || /replace|change|example|secret/i.test(environment.JWT_PREVIOUS_SECRET)
        )) {
            context.addIssue({
                code: "custom",
                message: "JWT_PREVIOUS_SECRET deve ser um segredo anterior forte.",
                path: ["JWT_PREVIOUS_SECRET"],
            });
        }
        if (!environment.DB_SSL || !environment.DB_SSL_REJECT_UNAUTHORIZED) {
            context.addIssue({
                code: "custom",
                message: "Em produção, a conexão PostgreSQL deve validar TLS.",
                path: ["DB_SSL"],
            });
        }
        if (environment.AUTH_EXPOSE_TOKENS_IN_BODY) {
            context.addIssue({
                code: "custom",
                message: "Em produção, tokens não podem ser expostos no corpo da resposta.",
                path: ["AUTH_EXPOSE_TOKENS_IN_BODY"],
            });
        }
        if (environment.ACCOUNT_TOKENS_EXPOSE_IN_RESPONSE) {
            context.addIssue({
                code: "custom",
                message: "Account tokens cannot be exposed in production responses.",
                path: ["ACCOUNT_TOKENS_EXPOSE_IN_RESPONSE"],
            });
        }
        if (!environment.PUBLIC_APP_URL.startsWith("https://")) {
            context.addIssue({
                code: "custom",
                message: "PUBLIC_APP_URL must use HTTPS in production.",
                path: ["PUBLIC_APP_URL"],
            });
        }
        if (!environment.MFA_ENABLED || !environment.MFA_REQUIRE_ADMINISTRATORS) {
            context.addIssue({
                code: "custom",
                message: "MFA must be enabled and required for administrators in production.",
                path: ["MFA_REQUIRE_ADMINISTRATORS"],
            });
        }
        if (!environment.EMAIL_DELIVERY_ENABLED) {
            context.addIssue({
                code: "custom",
                message: "E-mail delivery must be enabled in production.",
                path: ["EMAIL_DELIVERY_ENABLED"],
            });
        }
        if (!environment.SMTP_REJECT_UNAUTHORIZED) {
            context.addIssue({
                code: "custom",
                message: "SMTP TLS certificates must be validated in production.",
                path: ["SMTP_REJECT_UNAUTHORIZED"],
            });
        }
        if (!environment.FILE_ANTIVIRUS_ENABLED) {
            context.addIssue({
                code: "custom",
                message: "Antimalware scanning must be enabled in production.",
                path: ["FILE_ANTIVIRUS_ENABLED"],
            });
        }
        if (!environment.METRICS_ENABLED || !environment.METRICS_TOKEN) {
            context.addIssue({
                code: "custom",
                message: "Authenticated metrics must be enabled in production.",
                path: ["METRICS_TOKEN"],
            });
        }
    }
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
    const issues = parsedEnvironment.error.issues
        .map((issue) => `${issue.path.join(".") || "ambiente"}: ${issue.message}`)
        .join("; ");
    throw new Error(`Configuração de ambiente inválida: ${issues}`);
}

export const env = parsedEnvironment.data;

export const corsOrigins = env.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const useSecureCookies = env.NODE_ENV === "production";
