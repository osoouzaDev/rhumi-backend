import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let accessToken;
const created = {
    cycleId: undefined,
    assignmentId: undefined,
    goalId: undefined,
    feedbackEventId: undefined,
};

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

const dateFromToday = (days) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

const cleanup = async () => {
    const ids = Object.values(created).filter(Boolean);
    if (ids.length === 0) return;
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        if (created.assignmentId) {
            await client.query("DELETE FROM evaluation_responses WHERE assignment_id = $1", [created.assignmentId]);
            await client.query("DELETE FROM performance_goals WHERE assignment_id = $1", [created.assignmentId]);
            await client.query("DELETE FROM evaluation_assignments WHERE id = $1", [created.assignmentId]);
        }
        if (created.feedbackEventId) {
            await client.query("DELETE FROM calendar_event_attendees WHERE event_id = $1", [created.feedbackEventId]);
            await client.query("DELETE FROM calendar_events WHERE id = $1", [created.feedbackEventId]);
        }
        if (created.cycleId) {
            await client.query("DELETE FROM evaluation_competencies WHERE cycle_id = $1", [created.cycleId]);
            await client.query("DELETE FROM evaluation_cycles WHERE id = $1", [created.cycleId]);
        }
        await client.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::UUID[])", [ids]);
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
    const me = await request("/api/v1/auth/me");
    const employeeId = me.payload.data.user.employeeId;
    const departmentId = me.payload.data.user.departmentId;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const cycle = await request("/api/v1/evaluations/cycles", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `PERFORMANCE-${suffix}`,
            name: `AvaliaÃƒÂ§ÃƒÂ£o temporÃƒÂ¡ria ${suffix}`,
            description: "Ciclo temporÃƒÂ¡rio criado para validar o fluxo completo de desempenho.",
            status: "active",
            startsOn: dateFromToday(-1),
            selfReviewDeadline: dateFromToday(5),
            managerReviewDeadline: dateFromToday(10),
            feedbackDeadline: dateFromToday(15),
            selfWeight: 30,
            managerWeight: 70,
            competencies: [
                { name: "ColaboraÃƒÂ§ÃƒÂ£o", category: "behavioral", weight: 40,
                    description: "Colabora com a equipe e compartilha conhecimentos relevantes." },
                { name: "Qualidade das entregas", category: "technical", weight: 60,
                    description: "Entrega resultados com qualidade, consistÃƒÂªncia e previsibilidade." },
            ],
        }),
    });
    created.cycleId = cycle.payload.data.cycle.id;
    const competencies = cycle.payload.data.cycle.competencies;
    assert.equal(competencies.length, 2);

    const assigned = await request(`/api/v1/evaluations/cycles/${created.cycleId}/participants`, {
        method: "POST",
        body: JSON.stringify({
            participants: [{ employeeId, evaluatorEmployeeId: employeeId }],
        }),
    });
    assert.equal(assigned.payload.data.assigned, 1);
    created.assignmentId = assigned.payload.data.assignments[0].id;

    const goal = await request(`/api/v1/evaluations/assignments/${created.assignmentId}/goals`, {
        method: "POST",
        body: JSON.stringify({
            title: "Melhorar previsibilidade das entregas",
            description: "Planejar e acompanhar as entregas relevantes do ciclo.",
            successCriteria: "Entregar pelo menos noventa por cento dos itens dentro do prazo.",
            weight: 100,
            targetDate: dateFromToday(15),
        }),
    });
    created.goalId = goal.payload.data.goal.id;
    await request(`/api/v1/evaluations/me/${created.assignmentId}/goals/${created.goalId}`, {
        method: "PATCH",
        body: JSON.stringify({ progressPercent: 50, employeeNotes: "Meta em andamento." }),
    });

    const selfReview = await request(`/api/v1/evaluations/me/${created.assignmentId}/self-review`, {
        method: "POST",
        body: JSON.stringify({
            responses: [
                { competencyId: competencies[0].id, score: 4,
                    comment: "Mantive boa colaboraÃƒÂ§ÃƒÂ£o ao longo do ciclo." },
                { competencyId: competencies[1].id, score: 5,
                    comment: "As entregas mantiveram o padrÃƒÂ£o esperado." },
            ],
            employeeSummary: "PerÃƒÂ­odo positivo, com evoluÃƒÂ§ÃƒÂ£o tÃƒÂ©cnica e boa colaboraÃƒÂ§ÃƒÂ£o.",
        }),
    });
    assert.equal(selfReview.payload.data.assignment.status, "manager_review");
    assert.equal(selfReview.payload.data.assignment.managerScore, null);

    const managerReview = await request(
        `/api/v1/evaluations/assignments/${created.assignmentId}/manager-review`, {
            method: "POST",
            body: JSON.stringify({
                responses: [
                    { competencyId: competencies[0].id, score: 5,
                        comment: "Excelente integraÃƒÂ§ÃƒÂ£o com a equipe." },
                    { competencyId: competencies[1].id, score: 4,
                        comment: "Boas entregas e oportunidade de melhorar estimativas." },
                ],
                strengths: "ColaboraÃƒÂ§ÃƒÂ£o consistente e responsabilidade com os resultados.",
                improvementPoints: "Pode aperfeiÃƒÂ§oar a previsibilidade das estimativas de entrega.",
                developmentActions: "Acompanhar a meta e revisar o planejamento semanalmente.",
            }),
        },
    );
    assert.equal(managerReview.payload.data.assignment.status, "feedback_pending");
    assert.equal(managerReview.payload.data.assignment.selfScore, 4.6);
    assert.equal(managerReview.payload.data.assignment.managerScore, 4.4);
    assert.equal(managerReview.payload.data.assignment.finalScore, 4.46);
    const privateList = await request("/api/v1/evaluations/me");
    const privateSummary = privateList.payload.data.assignments
        .find((item) => item.id === created.assignmentId);
    assert.equal(privateSummary.managerScore, null);
    assert.equal(privateSummary.finalScore, null);

    const feedbackStartsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
    const feedbackEndsAt = new Date(feedbackStartsAt.getTime() + 30 * 60 * 1_000);
    const scheduled = await request(
        `/api/v1/evaluations/assignments/${created.assignmentId}/feedback`, {
            method: "PUT",
            body: JSON.stringify({
                startsAt: feedbackStartsAt.toISOString(),
                endsAt: feedbackEndsAt.toISOString(),
                meetingUrl: "https://example.com/performance-feedback",
            }),
        },
    );
    created.feedbackEventId = scheduled.payload.data.assignment.feedbackEventId;
    assert.ok(created.feedbackEventId);
    const event = await request(`/api/v1/calendar/events/${created.feedbackEventId}`);
    assert.equal(event.payload.data.event.eventType, "evaluation");

    const completed = await request(
        `/api/v1/evaluations/assignments/${created.assignmentId}/feedback/complete`, {
            method: "POST",
            body: JSON.stringify({
                finalFeedback: "Feedback realizado com alinhamento das forÃƒÂ§as, oportunidades e prÃƒÂ³ximos passos.",
            }),
        },
    );
    assert.equal(completed.payload.data.assignment.status, "completed");

    const employeeView = await request(`/api/v1/evaluations/me/${created.assignmentId}`);
    assert.equal(employeeView.payload.data.assignment.finalScore, 4.46);
    assert.equal(employeeView.payload.data.assignment.responses.length, 4);
    const dashboard = await request("/api/v1/dashboard");
    assert.ok(dashboard.payload.data.dashboard.evaluations);

    console.log("Fluxo de avaliaÃƒÂ§ÃƒÂµes de desempenho validado com sucesso.");
} finally {
    try {
        if (accessToken) await request("/api/v1/auth/logout", { method: "POST" });
    } finally {
        await cleanup();
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        await Promise.all([closeDatabase(), closeMigrationDatabase()]);
    }
}
