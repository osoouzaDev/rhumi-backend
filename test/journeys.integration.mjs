import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let accessToken;
const created = {
    templateId: undefined,
    assignmentId: undefined,
    trainingId: undefined,
    classId: undefined,
    trainingCalendarEventId: undefined,
    trainingEnrollmentId: undefined,
    meetingCalendarEventId: undefined,
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

const cleanup = async () => {
    const ids = Object.values(created).filter(Boolean);
    if (ids.length === 0) return;
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        if (created.assignmentId) {
            await client.query("DELETE FROM journey_tasks WHERE assignment_id = $1", [created.assignmentId]);
            await client.query("DELETE FROM journey_assignments WHERE id = $1", [created.assignmentId]);
        }
        if (created.trainingEnrollmentId) {
            await client.query("DELETE FROM training_enrollments WHERE id = $1", [created.trainingEnrollmentId]);
        }
        for (const eventId of [created.meetingCalendarEventId, created.trainingCalendarEventId].filter(Boolean)) {
            await client.query("DELETE FROM calendar_event_attendees WHERE event_id = $1", [eventId]);
        }
        if (created.classId) await client.query("DELETE FROM training_classes WHERE id = $1", [created.classId]);
        if (created.meetingCalendarEventId) {
            await client.query("DELETE FROM calendar_events WHERE id = $1", [created.meetingCalendarEventId]);
        }
        if (created.trainingCalendarEventId) {
            await client.query("DELETE FROM calendar_events WHERE id = $1", [created.trainingCalendarEventId]);
        }
        if (created.templateId) await client.query("DELETE FROM journey_templates WHERE id = $1", [created.templateId]);
        if (created.trainingId) await client.query("DELETE FROM trainings WHERE id = $1", [created.trainingId]);
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

    const training = await request("/api/v1/trainings", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `JOURNEY-TRAINING-${suffix}`,
            title: `Treinamento de integração ${suffix}`,
            description: "Treinamento temporário utilizado pela validação da jornada de onboarding.",
            modality: "online",
            workloadMinutes: 30,
            materials: [],
            status: "published",
        }),
    });
    created.trainingId = training.payload.data.training.id;

    const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1_000);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1_000);
    const trainingClass = await request(`/api/v1/trainings/${created.trainingId}/classes`, {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            name: `Turma de integração ${suffix}`,
            status: "open",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            capacity: 5,
            meetingUrl: "https://example.com/journey-training",
        }),
    });
    created.classId = trainingClass.payload.data.class.id;
    created.trainingCalendarEventId = trainingClass.payload.data.class.calendarEventId;

    const template = await request("/api/v1/journeys/templates", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `ONBOARDING-${suffix}`,
            name: `Onboarding temporário ${suffix}`,
            description: "Modelo temporário criado para validar todo o fluxo de jornada e onboarding.",
            kind: "onboarding",
            durationDays: 7,
            status: "published",
            stages: [{
                name: "Boas-vindas",
                startsAfterDays: 0,
                tasks: [
                    { title: "Confirmar leitura do guia", taskType: "document",
                        responsible: "collaborator", dueAfterDays: 0,
                        resourceUrl: "https://example.com/guide" },
                    { title: "Alinhamento com liderança", taskType: "meeting",
                        responsible: "owner", dueAfterDays: 1,
                        meetingTime: "09:00", meetingDurationMinutes: 30 },
                    { title: "Concluir treinamento de integração", taskType: "training",
                        responsible: "collaborator", dueAfterDays: 5,
                        trainingId: created.trainingId },
                ],
            }],
        }),
    });
    created.templateId = template.payload.data.template.id;
    assert.equal(template.payload.data.template.taskCount, 3);

    const assignment = await request("/api/v1/journeys/assignments", {
        method: "POST",
        body: JSON.stringify({ templateId: created.templateId, employeeId,
            ownerEmployeeId: employeeId }),
    });
    created.assignmentId = assignment.payload.data.assignment.id;
    const tasks = assignment.payload.data.assignment.stages.flatMap((stage) => stage.tasks);
    assert.equal(tasks.length, 3);
    const documentTask = tasks.find((task) => task.taskType === "document");
    const meetingTask = tasks.find((task) => task.taskType === "meeting");
    const trainingTask = tasks.find((task) => task.taskType === "training");
    created.meetingCalendarEventId = meetingTask.calendarEventId;
    created.trainingEnrollmentId = trainingTask.trainingEnrollmentId;
    assert.ok(created.meetingCalendarEventId);
    assert.ok(created.trainingEnrollmentId);

    const meetingEvent = await request(`/api/v1/calendar/events/${created.meetingCalendarEventId}`);
    assert.equal(meetingEvent.payload.data.event.eventType, "onboarding");
    assert.ok(meetingEvent.payload.data.event.attendees.some((attendee) => attendee.employeeId === employeeId));

    await request(`/api/v1/journeys/me/${created.assignmentId}/tasks/${documentTask.id}`, {
        method: "PATCH", body: JSON.stringify({ status: "completed" }),
    });
    await request(`/api/v1/journeys/me/${created.assignmentId}/tasks/${meetingTask.id}`, {
        method: "PATCH", body: JSON.stringify({ status: "completed" }),
    });
    await request(`/api/v1/trainings/me/enrollments/${created.trainingEnrollmentId}/progress`, {
        method: "PATCH", body: JSON.stringify({ progressPercent: 100 }),
    });

    const completed = await request(`/api/v1/journeys/me/${created.assignmentId}`);
    assert.equal(completed.payload.data.assignment.status, "completed");
    assert.equal(completed.payload.data.assignment.progressPercent, 100);
    const completedTrainingTask = completed.payload.data.assignment.stages
        .flatMap((stage) => stage.tasks).find((task) => task.taskType === "training");
    assert.equal(completedTrainingTask.status, "completed");

    const dashboard = await request("/api/v1/dashboard");
    assert.ok(dashboard.payload.data.dashboard.journeys);
    console.log("Fluxo de jornadas e onboarding validado com sucesso.");
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
