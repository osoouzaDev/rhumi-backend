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

    GLOBAL_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(60_000),
    GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(300),
    LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
    REFRESH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).default(900_000),
    REFRESH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
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

    MFA_ENABLED: booleanFromString(false),
    MFA_ENCRYPTION_KEY: optionalString,
    MFA_ISSUER: z.string().trim().min(1).max(80).default("RHumi"),
    MFA_CHALLENGE_EXPIRES_IN_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
    MFA_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
    MFA_RECOVERY_CODE_COUNT: z.coerce.number().int().min(5).max(20).default(10),

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
                    message: `${name} deve ser definido quando DATABASE_URL nÃƒÂ£o for utilizada.`,
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
                message: `Origem CORS invÃƒÂ¡lida: ${origin}`,
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
                message: "Em produÃƒÂ§ÃƒÂ£o, CORS_ORIGINS deve conter somente origens HTTPS explÃƒÂ­citas.",
                path: ["CORS_ORIGINS"],
            });
        }
        if (environment.JWT_SECRET.length < 48
            || /replace|change|example|secret/i.test(environment.JWT_SECRET)) {
            context.addIssue({
                code: "custom",
                message: "Em produÃƒÂ§ÃƒÂ£o, JWT_SECRET deve ter ao menos 48 caracteres nÃƒÂ£o previsÃƒÂ­veis.",
                path: ["JWT_SECRET"],
            });
        }
        if (!environment.DB_SSL || !environment.DB_SSL_REJECT_UNAUTHORIZED) {
            context.addIssue({
                code: "custom",
                message: "Em produÃƒÂ§ÃƒÂ£o, a conexÃƒÂ£o PostgreSQL deve validar TLS.",
                path: ["DB_SSL"],
            });
        }
        if (environment.AUTH_EXPOSE_TOKENS_IN_BODY) {
            context.addIssue({
                code: "custom",
                message: "Em produÃƒÂ§ÃƒÂ£o, tokens nÃƒÂ£o podem ser expostos no corpo da resposta.",
                path: ["AUTH_EXPOSE_TOKENS_IN_BODY"],
            });
        }
    }
});

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
    const issues = parsedEnvironment.error.issues
        .map((issue) => `${issue.path.join(".") || "ambiente"}: ${issue.message}`)
        .join("; ");
    throw new Error(`ConfiguraÃƒÂ§ÃƒÂ£o de ambiente invÃƒÂ¡lida: ${issues}`);
}

export const env = parsedEnvironment.data;

export const corsOrigins = env.CORS_ORIGINS
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

export const useSecureCookies = env.NODE_ENV === "production";
