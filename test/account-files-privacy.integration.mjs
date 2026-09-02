import assert from "node:assert/strict";
import app from "../dist/app.js";
import { closeDatabase } from "../dist/database/connection.js";
import { closeMigrationDatabase, default as migrationDatabase } from "../dist/database/migration-connection.js";
import { runNotificationAutomationCycle } from "../dist/services/background-workers.service.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const created = {
    employeeId: undefined,
    userId: undefined,
    fileIds: [],
    privacyRequestId: undefined,
    email: `lifecycle.${suffix}@rhumi.invalid`,
};

const api = async (path, { token, method = "GET", body, headers = {} } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        body,
        headers: {
            ...(typeof body === "string" ? { "content-type": "application/json" } : {}),
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = response.status === 204
        ? undefined
        : contentType.includes("json") ? await response.json() : await response.arrayBuffer();
    return { response, payload };
};

const success = async (path, options) => {
    const result = await api(path, options);
    if (!result.response.ok) {
        throw new Error(`${options?.method ?? "GET"} ${path}: ${result.response.status} ${result.payload?.error?.code}`);
    }
    return result.payload;
};

const cleanup = async () => {
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        if (created.userId) {
            await client.query("DELETE FROM notification_digest_deliveries WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM notifications WHERE recipient_user_id = $1", [created.userId]);
            await client.query("DELETE FROM notification_preferences WHERE user_id = $1", [created.userId]);
        }
        if (created.privacyRequestId) {
            await client.query("DELETE FROM privacy_requests WHERE id = $1", [created.privacyRequestId]);
        }
        if (created.employeeId) {
            await client.query("DELETE FROM privacy_consents WHERE employee_id = $1", [created.employeeId]);
        }
        if (created.fileIds.length) {
            await client.query("DELETE FROM file_access_tokens WHERE file_id = ANY($1::UUID[])", [created.fileIds]);
            await client.query("DELETE FROM stored_files WHERE id = ANY($1::UUID[])", [created.fileIds]);
        }
        if (created.userId) {
            await client.query("DELETE FROM account_tokens WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM sessions WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM user_permission_overrides WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM user_roles WHERE user_id = $1", [created.userId]);
            await client.query("DELETE FROM users WHERE id = $1", [created.userId]);
        }
        await client.query("DELETE FROM email_outbox WHERE recipient = $1", [created.email]);
        if (created.employeeId) {
            await client.query(
                "DELETE FROM audit_logs WHERE entity_id = ANY($1::UUID[])",
                [[created.employeeId, created.userId, created.privacyRequestId, ...created.fileIds].filter(Boolean)],
            );
            await client.query("DELETE FROM employees WHERE id = $1", [created.employeeId]);
        }
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

try {
    const adminLogin = await success("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: process.env.SEED_ADMIN_EMAIL,
            password: process.env.SEED_ADMIN_PASSWORD,
        }),
    });
    const adminToken = adminLogin.data.accessToken;
    const [departments, positions] = await Promise.all([
        success("/api/v1/departments", { token: adminToken }),
        success("/api/v1/positions", { token: adminToken }),
    ]);

    const employee = await success("/api/v1/employees", {
        method: "POST",
        token: adminToken,
        body: JSON.stringify({
            departmentId: departments.data.departments[0].id,
            positionId: positions.data.positions[0].id,
            employeeCode: `LIFE-${suffix}`,
            fullName: "Titular de teste integrado",
            email: created.email,
            contractType: "clt",
            admissionDate: new Date().toISOString().slice(0, 10),
        }),
    });
    created.employeeId = employee.data.employee.id;

    const account = await success("/api/v1/users", {
        method: "POST",
        token: adminToken,
        body: JSON.stringify({
            employeeId: created.employeeId,
            roleCodes: ["collaborator"],
            permissionOverrides: [],
        }),
    });
    created.userId = account.data.user.id;
    assert.match(account.data.invitation.token, /^[A-Za-z0-9_-]{64}$/);

    const firstPassword = `Account-${suffix}-Secure!`;
    await success("/api/v1/auth/activate", {
        method: "POST",
        body: JSON.stringify({ token: account.data.invitation.token, password: firstPassword }),
    });
    const firstLogin = await success("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: created.email, password: firstPassword }),
    });
    let collaboratorToken = firstLogin.data.accessToken;

    const sessions = await success("/api/v1/auth/sessions", { token: collaboratorToken });
    assert.equal(sessions.data.sessions.length, 1);

    const reset = await success("/api/v1/auth/password/forgot", {
        method: "POST",
        body: JSON.stringify({ identifier: created.email }),
    });
    const secondPassword = `Reset-${suffix}-Secure!`;
    await success("/api/v1/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token: reset.data.token, newPassword: secondPassword }),
    });
    const secondLogin = await success("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier: created.email, password: secondPassword }),
    });
    collaboratorToken = secondLogin.data.accessToken;

    const client = await migrationDatabase.connect();
    await client.query("UPDATE users SET email_verified_at = NULL WHERE id = $1", [created.userId]);
    client.release();
    const verification = await success("/api/v1/auth/email/verification", {
        method: "POST",
        token: collaboratorToken,
        body: JSON.stringify({}),
    });
    await success("/api/v1/auth/email/verify", {
        method: "POST",
        body: JSON.stringify({ token: verification.data.token }),
    });

    const form = new FormData();
    form.set("purpose", "integration_evidence");
    form.set("file", new Blob([
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]),
    ], { type: "image/png" }), "evidence.png");
    const uploaded = await success("/api/v1/files", {
        method: "POST",
        token: collaboratorToken,
        body: form,
    });
    const fileId = uploaded.data.file.id;
    created.fileIds.push(fileId);
    assert.equal(uploaded.data.file.scanStatus, "not_scanned");

    const link = await success(`/api/v1/files/${fileId}/links`, {
        method: "POST",
        token: collaboratorToken,
        body: JSON.stringify({ maxDownloads: 1, expiresInMinutes: 5 }),
    });
    const shared = await api(link.data.link.downloadUrl);
    assert.equal(shared.response.status, 200);
    assert.equal(shared.payload.byteLength, 11);
    const exhausted = await api(link.data.link.downloadUrl);
    assert.equal(exhausted.response.status, 404);

    await success("/api/v1/privacy/me/consents", {
        method: "POST",
        token: collaboratorToken,
        body: JSON.stringify({
            purpose: "communications",
            policyVersion: "2026-08",
            legalBasis: "consent",
            granted: true,
        }),
    });
    const privacyRequest = await success("/api/v1/privacy/me/requests", {
        method: "POST",
        token: collaboratorToken,
        body: JSON.stringify({ type: "export", reason: "Teste de portabilidade" }),
    });
    created.privacyRequestId = privacyRequest.data.privacyRequest.id;
    const processed = await success(
        `/api/v1/privacy/requests/${created.privacyRequestId}`,
        {
            method: "PATCH",
            token: adminToken,
            body: JSON.stringify({ decision: "approve", notes: "Exportação integrada validada" }),
        },
    );
    const exportFileId = processed.data.privacyRequest.resultFileId;
    created.fileIds.push(exportFileId);
    const personalExport = await api(`/api/v1/files/${exportFileId}/download`, {
        token: collaboratorToken,
    });
    assert.equal(personalExport.response.status, 200);
    const exportJson = personalExport.payload;
    assert.equal(exportJson.employee.id, created.employeeId);

    await success("/api/v1/notifications/preferences", {
        method: "PUT",
        token: collaboratorToken,
        body: JSON.stringify({
            emailEnabled: true,
            digestFrequency: "immediate",
        }),
    });
    await success("/api/v1/notifications/announcements", {
        method: "POST",
        token: adminToken,
        body: JSON.stringify({
            audienceType: "employees",
            employeeIds: [created.employeeId],
            title: "Aviso de integração",
            description: "Mensagem utilizada para validar a fila de e-mail.",
            priority: "normal",
        }),
    });
    await runNotificationAutomationCycle();
    const delivery = await migrationDatabase.query(
        `SELECT COUNT(*)::INTEGER AS total FROM email_outbox
         WHERE recipient = $1 AND template = 'notification_immediate'`,
        [created.email],
    );
    assert.equal(delivery.rows[0].total, 1);

    const auditExport = await api("/api/v1/audit-logs/export?format=csv", {
        token: adminToken,
    });
    assert.equal(auditExport.response.status, 200);
    assert.match(auditExport.response.headers.get("content-type") ?? "", /text\/csv/);
    const report = await api("/api/v1/reports/employees?format=pdf", {
        token: adminToken,
    });
    assert.equal(report.response.status, 200);
    assert.match(Buffer.from(report.payload).subarray(0, 5).toString(), /^%PDF-/);
    const openapi = await success("/docs/openapi.json");
    assert.equal(openapi.openapi, "3.1.0");

    await success(`/api/v1/files/${fileId}`, {
        method: "DELETE",
        token: collaboratorToken,
    });
    console.log("Ciclo de contas, arquivos, LGPD, automação e exportações validado.");
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
