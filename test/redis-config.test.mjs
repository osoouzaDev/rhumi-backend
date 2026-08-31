import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const baseEnvironment = {
    ...process.env,
    NODE_ENV: "test",
    DB_HOST: "localhost",
    DB_PORT: "5432",
    DB_USER: "postgres",
    DB_PASSWORD: "test-password",
    DB_NAME: "rhumi_test",
    DB_SSL: "false",
    JWT_SECRET: "test-secret-with-more-than-32-characters-long",
    JWT_ISSUER: "rhumi-api-test",
    JWT_AUDIENCE: "rhumi-client-test",
    MFA_ENABLED: "false",
};

const validateEnvironment = (overrides) => spawnSync(
    process.execPath,
    [
        "--input-type=module",
        "-e",
        "await import('./dist/config/env.js')",
    ],
    {
        cwd: process.cwd(),
        env: { ...baseEnvironment, ...overrides },
        encoding: "utf8",
    },
);

test("aceita rate limiting local sem Redis", () => {
    const result = validateEnvironment({
        RATE_LIMIT_STORE: "memory",
        REDIS_URL: "",
    });
    assert.equal(result.status, 0, result.stderr);
});

test("exige REDIS_URL quando o armazenamento distribuído está habilitado", () => {
    const result = validateEnvironment({
        RATE_LIMIT_STORE: "redis",
        REDIS_URL: "",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /REDIS_URL/);
});

test("aceita uma URL Redis explícita para múltiplas instâncias", () => {
    const result = validateEnvironment({
        RATE_LIMIT_STORE: "redis",
        REDIS_URL: "redis://localhost:6379",
    });
    assert.equal(result.status, 0, result.stderr);
});

