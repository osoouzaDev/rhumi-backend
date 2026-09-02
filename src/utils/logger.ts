import { env } from "../config/env.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const priorities: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};

const serializeError = (error: unknown): Record<string, unknown> => {
    if (!(error instanceof Error)) return { type: typeof error };
    const coded = error as Error & { code?: unknown };
    return {
        name: error.name,
        message: error.message,
        ...(typeof coded.code === "string" ? { code: coded.code } : {}),
        ...(env.NODE_ENV !== "production" && error.stack ? { stack: error.stack } : {}),
    };
};

const sanitize = (value: unknown, key = ""): unknown => {
    if (/password|secret|token|authorization|cookie|smtp|database_url/i.test(key)) {
        return "[REDACTED]";
    }
    if (value instanceof Error) return serializeError(value);
    if (Array.isArray(value)) return value.map((item) => sanitize(item));
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .map(([childKey, child]) => [childKey, sanitize(child, childKey)]),
        );
    }
    return value;
};

const write = (
    level: LogLevel,
    event: string,
    fields: Record<string, unknown> = {},
): void => {
    if (priorities[level] < priorities[env.LOG_LEVEL]) return;
    const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        service: env.SERVICE_NAME,
        environment: env.NODE_ENV,
        event,
        ...sanitize(fields) as Record<string, unknown>,
    });
    if (level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
};

export const logger = {
    debug: (event: string, fields?: Record<string, unknown>) => write("debug", event, fields),
    info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
    error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
