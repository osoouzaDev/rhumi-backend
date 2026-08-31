import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const created = {
    vacancyId: undefined,
    candidateId: undefined,
    applicationId: undefined,
};
let accessToken;

const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
            ...options.headers,
        },
    });
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) {
        throw new Error(`${options.method ?? "GET"} ${path} retornou ${response.status}: ${payload?.error?.code}`);
    }
    return { response, payload };
};

const cleanup = async () => {
    const ids = [created.vacancyId, created.candidateId, created.applicationId].filter(Boolean);
    if (ids.length === 0) {
        return;
    }

    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        if (created.applicationId) {
            await client.query("DELETE FROM job_applications WHERE id = $1", [created.applicationId]);
        }
        await client.query(
            "DELETE FROM audit_logs WHERE entity_id = ANY($1::UUID[])",
            [ids],
        );
        if (created.candidateId) {
            await client.query("DELETE FROM candidates WHERE id = $1", [created.candidateId]);
        }
        if (created.vacancyId) {
            await client.query("DELETE FROM vacancies WHERE id = $1", [created.vacancyId]);
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
    const login = await request("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: process.env.SEED_ADMIN_EMAIL,
            password: process.env.SEED_ADMIN_PASSWORD,
        }),
    });
    accessToken = login.payload.data.accessToken;

    const departments = await request("/api/v1/departments?pageSize=1");
    const department = departments.payload.data.departments[0];
    assert.ok(department);
    const positions = await request(`/api/v1/positions?departmentId=${department.id}&pageSize=1`);
    const position = positions.payload.data.positions[0];
    assert.ok(position);

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const vacancy = await request("/api/v1/recruitment/vacancies", {
        method: "POST",
        body: JSON.stringify({
            departmentId: department.id,
            positionId: position.id,
            title: `Vaga temporÃ¡ria ${suffix}`,
            description: "Vaga temporÃ¡ria criada exclusivamente para teste automatizado de integraÃ§Ã£o.",
            contractType: "clt",
            workModel: "remote",
            status: "open",
        }),
    });
    created.vacancyId = vacancy.payload.data.vacancy.id;

    const candidate = await request("/api/v1/recruitment/candidates", {
        method: "POST",
        body: JSON.stringify({
            fullName: "Candidato TemporÃ¡rio",
            email: `codex-smoke-${suffix}@example.com`,
            source: "integration-test",
        }),
    });
    created.candidateId = candidate.payload.data.candidate.id;

    const application = await request(
        `/api/v1/recruitment/vacancies/${created.vacancyId}/applications`,
        {
            method: "POST",
            body: JSON.stringify({ candidateId: created.candidateId, score: 82 }),
        },
    );
    created.applicationId = application.payload.data.application.id;

    await request(`/api/v1/recruitment/applications/${created.applicationId}`, {
        method: "PATCH",
        body: JSON.stringify({ stage: "screening", stageNotes: "Teste de movimentaÃ§Ã£o" }),
    });
    const board = await request(`/api/v1/recruitment/vacancies/${created.vacancyId}/board`);
    const screening = board.payload.data.board.columns.find((column) => column.stage === "screening");
    assert.equal(screening.total, 1);

    const detail = await request(`/api/v1/recruitment/applications/${created.applicationId}`);
    assert.equal(detail.payload.data.history.length, 2);

    assert.equal((await request(`/api/v1/recruitment/applications/${created.applicationId}`, {
        method: "DELETE",
    })).response.status, 204);
    assert.equal((await request(`/api/v1/recruitment/candidates/${created.candidateId}`, {
        method: "DELETE",
    })).response.status, 204);
    assert.equal((await request(`/api/v1/recruitment/vacancies/${created.vacancyId}`, {
        method: "DELETE",
    })).response.status, 204);

    console.log("Fluxo de recrutamento validado com sucesso.");
} finally {
    try {
        if (accessToken) {
            await request("/api/v1/auth/logout", { method: "POST" });
        }
    } finally {
        await cleanup();
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        await Promise.all([closeDatabase(), closeMigrationDatabase()]);
    }
}
