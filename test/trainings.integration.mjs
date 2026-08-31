import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let accessToken;
const created = {
    trainingId: undefined,
    classId: undefined,
    calendarEventId: undefined,
    enrollmentId: undefined,
    examId: undefined,
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
        if (created.enrollmentId) {
            await client.query(
                "DELETE FROM training_exam_attempts WHERE enrollment_id = $1",
                [created.enrollmentId],
            );
        }
        if (created.examId) {
            await client.query("DELETE FROM training_exam_questions WHERE exam_id = $1", [created.examId]);
            await client.query("DELETE FROM training_exams WHERE id = $1", [created.examId]);
        }
        if (created.enrollmentId) {
            await client.query("DELETE FROM training_enrollments WHERE id = $1", [created.enrollmentId]);
        }
        if (created.classId) {
            await client.query("DELETE FROM training_classes WHERE id = $1", [created.classId]);
        }
        if (created.calendarEventId) {
            await client.query("DELETE FROM calendar_events WHERE id = $1", [created.calendarEventId]);
        }
        if (created.trainingId) {
            await client.query("DELETE FROM trainings WHERE id = $1", [created.trainingId]);
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

    const training = await request("/api/v1/trainings", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `TEST-${suffix}`,
            title: `Treinamento temporário ${suffix}`,
            description: "Treinamento temporário criado para validar o fluxo completo do módulo.",
            objectives: "Validar catálogo, turmas, inscrições, prova e resultado.",
            instructor: "Instrutor de Teste",
            modality: "online",
            workloadMinutes: 60,
            materials: [{
                title: "Material de teste",
                type: "link",
                url: "https://example.com/training",
            }],
            status: "published",
        }),
    });
    created.trainingId = training.payload.data.training.id;

    const exam = await request(`/api/v1/trainings/${created.trainingId}/exam`, {
        method: "PUT",
        body: JSON.stringify({
            title: "Avaliação temporária",
            passingScore: 70,
            maxAttempts: 2,
            published: true,
            questions: [{
                prompt: "O RHumi centraliza processos de gestão de pessoas?",
                questionType: "true_false",
                points: 1,
                options: [
                    { text: "Verdadeiro", isCorrect: true },
                    { text: "Falso", isCorrect: false },
                ],
            }],
        }),
    });
    created.examId = exam.payload.data.exam.id;
    const managerQuestion = exam.payload.data.exam.questions[0];
    const correctOption = managerQuestion.options.find((option) => option.isCorrect);

    const startsAt = new Date(Date.now() + 72 * 60 * 60 * 1_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1_000);
    const trainingClass = await request(`/api/v1/trainings/${created.trainingId}/classes`, {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            name: `Turma temporária ${suffix}`,
            status: "open",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            capacity: 10,
            meetingUrl: "https://example.com/meeting",
        }),
    });
    created.classId = trainingClass.payload.data.class.id;
    created.calendarEventId = trainingClass.payload.data.class.calendarEventId;
    assert.ok(created.calendarEventId);

    const assigned = await request(`/api/v1/trainings/classes/${created.classId}/enrollments`, {
        method: "POST",
        body: JSON.stringify({ employeeIds: [employeeId] }),
    });
    assert.equal(assigned.payload.data.assigned, 1);

    const enrollments = await request(`/api/v1/trainings/classes/${created.classId}/enrollments`);
    created.enrollmentId = enrollments.payload.data.enrollments[0].id;
    assert.equal(enrollments.payload.data.enrollments[0].employeeId, employeeId);

    const from = encodeURIComponent(new Date(startsAt.getTime() - 60_000).toISOString());
    const to = encodeURIComponent(new Date(endsAt.getTime() + 60_000).toISOString());
    const calendar = await request(`/api/v1/calendar/events?from=${from}&to=${to}&eventType=training`);
    assert.ok(calendar.payload.data.events.some((event) => event.id === created.calendarEventId));

    const selfExam = await request(`/api/v1/trainings/me/enrollments/${created.enrollmentId}/exam`);
    assert.equal("isCorrect" in selfExam.payload.data.exam.questions[0].options[0], false);

    await request(`/api/v1/trainings/me/enrollments/${created.enrollmentId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progressPercent: 80 }),
    });

    const attempt = await request(`/api/v1/trainings/me/enrollments/${created.enrollmentId}/attempts`, {
        method: "POST",
        body: JSON.stringify({
            answers: [{
                questionId: managerQuestion.id,
                selectedOptionIds: [correctOption.id],
            }],
        }),
    });
    assert.equal(attempt.payload.data.attempt.passed, true);
    assert.equal(attempt.payload.data.attempt.score, 100);

    const myTraining = await request(`/api/v1/trainings/me/enrollments/${created.enrollmentId}`);
    assert.equal(myTraining.payload.data.enrollment.status, "completed");
    assert.equal(myTraining.payload.data.enrollment.bestScore, 100);

    const dashboard = await request("/api/v1/dashboard");
    assert.ok(dashboard.payload.data.dashboard.trainings);

    console.log("Fluxo de treinamentos e provas validado com sucesso.");
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
