import assert from "node:assert/strict";
import argon2 from "argon2";
import * as OTPAuth from "otpauth";
import app from "../dist/app.js";
import { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, {
    closeMigrationDatabase,
} from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const created = {
    companyId: undefined,
    departmentId: undefined,
    positionId: undefined,
    employeeId: undefined,
    userId: undefined,
};

const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
            ...options.headers,
        },
    });
    const payload = response.status === 204 ? undefined : await response.json();
    return { response, payload };
};

const requireSuccess = async (path, options = {}) => {
    const result = await request(path, options);
    if (!result.response.ok) {
        throw new Error(
            `${options.method ?? "GET"} ${path} retornou ${result.response.status}: `
            + `${result.payload?.error?.code}`,
        );
    }
    return result;
};

const cleanup = async () => {
    if (!created.companyId) return;
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        await client.query(
            "DELETE FROM mfa_login_challenges WHERE company_id = $1",
            [created.companyId],
        );
        await client.query(
            "DELETE FROM user_mfa_settings WHERE company_id = $1",
            [created.companyId],
        );
        await client.query("DELETE FROM audit_logs WHERE company_id = $1", [created.companyId]);
        if (created.userId) {
            await client.query("DELETE FROM sessions WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM user_roles WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM users WHERE id = $1", [created.userId]);
        }
        await client.query("DELETE FROM employees WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM positions WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM departments WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM companies WHERE id = $1", [created.companyId]);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

try {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const email = `mfa.${suffix}@security.invalid`;
    const password = `Mfa-${suffix}-Secure!`;
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        const company = await client.query(
            `INSERT INTO companies (legal_name, trade_name, tax_id)
             VALUES ($1, $2, $3) RETURNING id`,
            [`Empresa MFA ${suffix}`, `MFA ${suffix}`, `MFA-${suffix.slice(-16)}`],
        );
        created.companyId = company.rows[0].id;
        const department = await client.query(
            `INSERT INTO departments (company_id, name, acronym)
             VALUES ($1, $2, $3) RETURNING id`,
            [created.companyId, `SeguranÃ§a ${suffix}`, `M${suffix.slice(-5)}`],
        );
        created.departmentId = department.rows[0].id;
        const position = await client.query(
            `INSERT INTO positions (company_id, department_id, title)
             VALUES ($1, $2, $3) RETURNING id`,
            [created.companyId, created.departmentId, `Administrador ${suffix}`],
        );
        created.positionId = position.rows[0].id;
        const employee = await client.query(
            `INSERT INTO employees (
                company_id, department_id, position_id, employee_code,
                full_name, email, contract_type, admission_date
             ) VALUES ($1, $2, $3, $4, $5, $6, 'clt', CURRENT_DATE)
             RETURNING id`,
            [
                created.companyId,
                created.departmentId,
                created.positionId,
                `MFA-${suffix}`,
                `Administrador MFA ${suffix}`,
                email,
            ],
        );
        created.employeeId = employee.rows[0].id;
        const user = await client.query(
            "INSERT INTO users (employee_id, password_hash) VALUES ($1, $2) RETURNING id",
            [created.employeeId, passwordHash],
        );
        created.userId = user.rows[0].id;
        await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             SELECT $1, id FROM roles
             WHERE code = 'administrator' AND company_id IS NULL`,
            [created.userId],
        );
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    const firstLogin = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password }),
    });
    assert.equal(firstLogin.response.status, 200);
    const initialToken = firstLogin.payload.data.accessToken;

    const setup = await requireSuccess("/api/v1/auth/mfa/setup", {
        method: "POST",
        token: initialToken,
    });
    assert.equal(setup.response.status, 201);
    const manualKey = setup.payload.data.setup.manualKey;
    assert.ok(setup.payload.data.setup.otpauthUri.startsWith("otpauth://totp/"));

    const generator = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(manualKey),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
    });
    const confirmationCode = generator.generate();
    const confirmation = await requireSuccess("/api/v1/auth/mfa/confirm", {
        method: "POST",
        token: initialToken,
        body: JSON.stringify({ code: confirmationCode }),
    });
    assert.equal(confirmation.payload.data.recoveryCodes.length, 10);
    const recoveryCode = confirmation.payload.data.recoveryCodes[0];
    const disableRecoveryCode = confirmation.payload.data.recoveryCodes[1];

    const challengedLogin = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password }),
    });
    assert.equal(challengedLogin.response.status, 202);
    assert.equal(challengedLogin.payload.data.mfaRequired, true);
    assert.equal("accessToken" in challengedLogin.payload.data, false);

    const currentCode = generator.generate({ timestamp: Date.now() + 30_000 });
    const verified = await requireSuccess("/api/v1/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({
            challengeToken: challengedLogin.payload.data.challengeToken,
            code: currentCode,
        }),
    });
    assert.ok(verified.payload.data.accessToken);

    const replayChallenge = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password }),
    });
    const replay = await request("/api/v1/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({
            challengeToken: replayChallenge.payload.data.challengeToken,
            code: currentCode,
        }),
    });
    assert.equal(replay.response.status, 401);
    assert.equal(replay.payload.error.code, "INVALID_MFA_CODE");

    const recoveryChallenge = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password }),
    });
    const recovered = await requireSuccess("/api/v1/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({
            challengeToken: recoveryChallenge.payload.data.challengeToken,
            code: recoveryCode,
        }),
    });
    const recoveredToken = recovered.payload.data.accessToken;

    const reusedRecoveryChallenge = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password }),
    });
    const reusedRecovery = await request("/api/v1/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({
            challengeToken: reusedRecoveryChallenge.payload.data.challengeToken,
            code: recoveryCode,
        }),
    });
    assert.equal(reusedRecovery.response.status, 401);
    assert.equal(reusedRecovery.payload.error.code, "INVALID_MFA_CODE");

    await requireSuccess("/api/v1/auth/mfa", {
        method: "DELETE",
        token: recoveredToken,
        body: JSON.stringify({ password, code: disableRecoveryCode }),
    });

    const loginAfterDisable = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: email, password }),
    });
    assert.equal(loginAfterDisable.response.status, 200);
    assert.ok(loginAfterDisable.payload.data.accessToken);

    console.log("Fluxo de MFA, recuperaÃ§Ã£o e proteÃ§Ã£o contra replay validado com sucesso.");
} finally {
    try {
        await cleanup();
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
        await Promise.all([closeDatabase(), closeMigrationDatabase()]);
    }
}
