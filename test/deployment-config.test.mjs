import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const runValidation = (path) => new Promise((resolve) => {
    const child = spawn(
        process.execPath,
        ["scripts/validate-deployment-env.mjs", path],
        {
            cwd: process.cwd(),
            env: process.env,
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
});

test("valida um ambiente completo sem revelar segredos", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rhumi-env-test-"));
    const path = join(directory, "staging.env");
    try {
        await writeFile(path, [
            "NODE_ENV=production",
            "CORS_ORIGINS=https://staging.rhumi.invalid",
            "DATABASE_URL=postgresql://rhumi_app:private@db.rhumi.invalid:5432/rhumi",
            "DB_SSL=true",
            "DB_SSL_REJECT_UNAUTHORIZED=true",
            `JWT_SECRET=${"j".repeat(64)}`,
            "JWT_ISSUER=rhumi-staging",
            "JWT_AUDIENCE=rhumi-staging-client",
            "AUTH_EXPOSE_TOKENS_IN_BODY=false",
            "ACCOUNT_TOKENS_EXPOSE_IN_RESPONSE=false",
            "PUBLIC_APP_URL=https://staging.rhumi.invalid",
            "RATE_LIMIT_STORE=redis",
            "REDIS_URL=redis://:private@redis:6379",
            "MFA_ENABLED=true",
            "MFA_REQUIRE_ADMINISTRATORS=true",
            "MFA_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
            "EMAIL_DELIVERY_ENABLED=true",
            "SMTP_HOST=mailpit",
            "SMTP_REJECT_UNAUTHORIZED=true",
            "EMAIL_FROM_ADDRESS=no-reply@rhumi.invalid",
            "FILE_ANTIVIRUS_ENABLED=true",
            "METRICS_ENABLED=true",
            `METRICS_TOKEN=${"m".repeat(48)}`,
        ].join("\n"));

        const result = await runValidation(path);
        assert.equal(result.code, 0, result.stderr);
        assert.equal(JSON.parse(result.stdout).valid, true);
        assert.doesNotMatch(result.stdout, /private|j{16}|m{16}/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("recusa valores de exemplo antes do deploy", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rhumi-env-test-"));
    const path = join(directory, "staging.env");
    try {
        await writeFile(path, [
            "NODE_ENV=production",
            "CORS_ORIGINS=https://staging.rhumi.invalid",
            "DATABASE_URL=postgresql://CHANGE_ME",
            "JWT_SECRET=CHANGE_ME",
            "PUBLIC_APP_URL=https://staging.rhumi.invalid",
            "MFA_ENCRYPTION_KEY=CHANGE_ME",
            "METRICS_TOKEN=CHANGE_ME",
        ].join("\n"));

        const result = await runValidation(path);
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /Valores de exemplo ainda presentes/);
        assert.doesNotMatch(result.stderr, /postgresql:\/\/CHANGE_ME/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
