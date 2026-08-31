import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let accessToken;
const created = {
    targetPositionId: undefined,
    trainingId: undefined,
    classId: undefined,
    trainingCalendarEventId: undefined,
    trainingEnrollmentId: undefined,
    evaluationCycleId: undefined,
    evaluationAssignmentId: undefined,
    feedbackEventId: undefined,
    trackId: undefined,
    profileId: undefined,
    planId: undefined,
    mentoringEventId: undefined,
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
const instantFromNow = (hours) => new Date(Date.now() + hours * 60 * 60 * 1_000);

const cleanup = async () => {
    const ids = Object.values(created).filter(Boolean);
    if (ids.length === 0) return;
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        if (created.planId) {
            await client.query(
                `DELETE FROM development_actions
                 WHERE objective_id IN (SELECT id FROM development_objectives WHERE plan_id = $1)`,
                [created.planId],
            );
            await client.query("DELETE FROM development_objectives WHERE plan_id = $1", [created.planId]);
            await client.query("DELETE FROM development_plans WHERE id = $1", [created.planId]);
        }
        if (created.profileId) {
            await client.query("DELETE FROM employee_career_profiles WHERE id = $1", [created.profileId]);
        }
        if (created.trackId) {
            await client.query(
                `DELETE FROM career_level_trainings
                 WHERE level_id IN (SELECT id FROM career_levels WHERE track_id = $1)`,
                [created.trackId],
            );
            await client.query(
                `DELETE FROM career_level_competencies
                 WHERE level_id IN (SELECT id FROM career_levels WHERE track_id = $1)`,
                [created.trackId],
            );
            await client.query("DELETE FROM career_levels WHERE track_id = $1", [created.trackId]);
            await client.query("DELETE FROM career_tracks WHERE id = $1", [created.trackId]);
        }
        if (created.trainingEnrollmentId) {
            await client.query("DELETE FROM training_enrollments WHERE id = $1", [created.trainingEnrollmentId]);
        }
        if (created.classId) await client.query("DELETE FROM training_classes WHERE id = $1", [created.classId]);
        for (const eventId of [created.mentoringEventId, created.feedbackEventId,
            created.trainingCalendarEventId].filter(Boolean)) {
            await client.query("DELETE FROM calendar_event_attendees WHERE event_id = $1", [eventId]);
            await client.query("DELETE FROM calendar_events WHERE id = $1", [eventId]);
        }
        if (created.trainingId) await client.query("DELETE FROM trainings WHERE id = $1", [created.trainingId]);
        if (created.evaluationAssignmentId) {
            await client.query("DELETE FROM evaluation_responses WHERE assignment_id = $1",
                [created.evaluationAssignmentId]);
            await client.query("DELETE FROM evaluation_assignments WHERE id = $1",
                [created.evaluationAssignmentId]);
        }
        if (created.evaluationCycleId) {
            await client.query("DELETE FROM evaluation_competencies WHERE cycle_id = $1",
                [created.evaluationCycleId]);
            await client.query("DELETE FROM evaluation_cycles WHERE id = $1",
                [created.evaluationCycleId]);
        }
        if (created.targetPositionId) {
            await client.query("DELETE FROM positions WHERE id = $1", [created.targetPositionId]);
        }
        await client.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::UUID[])", [ids]);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK"); throw error;
    } finally { client.release(); }
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
    const currentPositionId = me.payload.data.user.positionId;
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const targetPosition = await request("/api/v1/positions", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            title: `Especialista temporário ${suffix}`,
            description: "Cargo temporário utilizado para validar a trilha de carreira.",
        }),
    });
    created.targetPositionId = targetPosition.payload.data.position.id;

    const training = await request("/api/v1/trainings", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `PDI-TRAINING-${suffix}`,
            title: `Treinamento de carreira ${suffix}`,
            description: "Treinamento temporário utilizado pelas ações do plano de desenvolvimento.",
            modality: "online",
            workloadMinutes: 30,
            materials: [],
            status: "published",
        }),
    });
    created.trainingId = training.payload.data.training.id;
    const classStarts = instantFromNow(72);
    const trainingClass = await request(`/api/v1/trainings/${created.trainingId}/classes`, {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            name: `Turma PDI ${suffix}`,
            status: "open",
            startsAt: classStarts.toISOString(),
            endsAt: new Date(classStarts.getTime() + 30 * 60 * 1_000).toISOString(),
            capacity: 5,
        }),
    });
    created.classId = trainingClass.payload.data.class.id;
    created.trainingCalendarEventId = trainingClass.payload.data.class.calendarEventId;

    const evaluationCycle = await request("/api/v1/evaluations/cycles", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `PDI-SOURCE-${suffix}`,
            name: `Avaliação fonte ${suffix}`,
            description: "Avaliação temporária utilizada como origem do plano de desenvolvimento.",
            status: "active",
            startsOn: dateFromToday(-1),
            selfReviewDeadline: dateFromToday(2),
            managerReviewDeadline: dateFromToday(5),
            feedbackDeadline: dateFromToday(10),
            competencies: [{
                name: "Desenvolvimento técnico",
                description: "Evolui conhecimentos técnicos aplicáveis às responsabilidades do cargo.",
                category: "technical",
                weight: 100,
            }],
        }),
    });
    created.evaluationCycleId = evaluationCycle.payload.data.cycle.id;
    const competencyId = evaluationCycle.payload.data.cycle.competencies[0].id;
    const assigned = await request(
        `/api/v1/evaluations/cycles/${created.evaluationCycleId}/participants`, {
            method: "POST",
            body: JSON.stringify({ participants: [{ employeeId, evaluatorEmployeeId: employeeId }] }),
        },
    );
    created.evaluationAssignmentId = assigned.payload.data.assignments[0].id;
    await request(`/api/v1/evaluations/me/${created.evaluationAssignmentId}/self-review`, {
        method: "POST",
        body: JSON.stringify({ responses: [{ competencyId, score: 3,
            comment: "Competência selecionada para desenvolvimento." }] }),
    });
    await request(`/api/v1/evaluations/assignments/${created.evaluationAssignmentId}/manager-review`, {
        method: "POST",
        body: JSON.stringify({
            responses: [{ competencyId, score: 3,
                comment: "O PDI deve priorizar esta competência." }],
            strengths: "Boa capacidade de aprendizado e aplicação prática dos conhecimentos.",
            improvementPoints: "Precisa aprofundar conhecimentos técnicos para o próximo nível.",
            developmentActions: "Concluir treinamento e realizar acompanhamento por mentoria.",
        }),
    });
    const feedbackStarts = instantFromNow(24);
    const scheduledFeedback = await request(
        `/api/v1/evaluations/assignments/${created.evaluationAssignmentId}/feedback`, {
            method: "PUT",
            body: JSON.stringify({
                startsAt: feedbackStarts.toISOString(),
                endsAt: new Date(feedbackStarts.getTime() + 30 * 60 * 1_000).toISOString(),
            }),
        },
    );
    created.feedbackEventId = scheduledFeedback.payload.data.assignment.feedbackEventId;
    await request(`/api/v1/evaluations/assignments/${created.evaluationAssignmentId}/feedback/complete`, {
        method: "POST",
        body: JSON.stringify({
            finalFeedback: "Avaliação concluída com definição de ações para o plano de desenvolvimento.",
        }),
    });

    const track = await request("/api/v1/development/career-tracks", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            code: `CAREER-${suffix}`,
            name: `Trilha técnica ${suffix}`,
            description: "Trilha temporária para validar níveis, competências e requisitos de carreira.",
            status: "published",
            levels: [
                {
                    positionId: currentPositionId,
                    name: "Nível atual",
                    description: "Nível correspondente ao cargo atual do colaborador.",
                    competencies: [{ name: "Fundamentos técnicos",
                        description: "Domina os fundamentos necessários ao cargo atual.",
                        category: "technical", requiredLevel: 3 }],
                },
                {
                    positionId: created.targetPositionId,
                    name: "Especialista",
                    description: "Nível de referência técnica e apoio ao desenvolvimento da equipe.",
                    minimumMonthsExperience: 12,
                    requirements: "Demonstrar domínio técnico e concluir os requisitos do PDI.",
                    competencies: [{ name: "Referência técnica",
                        description: "Orienta decisões técnicas e compartilha conhecimentos avançados.",
                        category: "leadership", requiredLevel: 4 }],
                    trainings: [{ trainingId: created.trainingId, required: true }],
                },
            ],
        }),
    });
    created.trackId = track.payload.data.track.id;
    const currentLevelId = track.payload.data.track.levels[0].id;
    const targetLevelId = track.payload.data.track.levels[1].id;

    const careerProfile = await request(`/api/v1/development/career-profiles/${employeeId}`, {
        method: "PUT",
        body: JSON.stringify({
            trackId: created.trackId,
            currentLevelId,
            targetLevelId,
            managerNotes: "Perfil temporário para validação da trilha de carreira.",
        }),
    });
    created.profileId = careerProfile.payload.data.profile.id;
    assert.equal(careerProfile.payload.data.profile.readinessPercent, 0);

    const mentoringStarts = instantFromNow(48);
    const plan = await request("/api/v1/development/plans", {
        method: "POST",
        body: JSON.stringify({
            employeeId,
            managerEmployeeId: employeeId,
            evaluationAssignmentId: created.evaluationAssignmentId,
            targetCareerLevelId: targetLevelId,
            title: `PDI técnico ${suffix}`,
            description: "Plano temporário criado para validar o desenvolvimento e a carreira.",
            focusAreas: "Desenvolvimento técnico, mentoria e preparação para o próximo nível.",
            status: "active",
            startsOn: dateFromToday(0),
            targetEndOn: dateFromToday(15),
            objectives: [{
                title: "Preparação para especialista",
                description: "Desenvolver competências necessárias para alcançar o próximo nível.",
                successCriteria: "Concluir o treinamento e a sessão de mentoria previstas.",
                weight: 100,
                targetDate: dateFromToday(10),
                actions: [
                    {
                        actionType: "training",
                        title: "Treinamento obrigatório",
                        description: "Concluir o treinamento obrigatório do nível desejado.",
                        dueAt: instantFromNow(120).toISOString(),
                        trainingId: created.trainingId,
                    },
                    {
                        actionType: "mentoring",
                        title: "Mentoria de carreira",
                        description: "Realizar alinhamento sobre competências e próximos passos.",
                        dueAt: mentoringStarts.toISOString(),
                        meetingEndsAt: new Date(mentoringStarts.getTime() + 30 * 60 * 1_000).toISOString(),
                    },
                ],
            }],
        }),
    });
    created.planId = plan.payload.data.plan.id;
    const actions = plan.payload.data.plan.objectives[0].actions;
    const trainingAction = actions.find((action) => action.actionType === "training");
    const mentoringAction = actions.find((action) => action.actionType === "mentoring");
    created.trainingEnrollmentId = trainingAction.trainingEnrollmentId;
    created.mentoringEventId = mentoringAction.calendarEventId;
    assert.ok(created.trainingEnrollmentId);
    assert.ok(created.mentoringEventId);

    const mentoringEvent = await request(`/api/v1/calendar/events/${created.mentoringEventId}`);
    assert.equal(mentoringEvent.payload.data.event.eventType, "meeting");
    await request(`/api/v1/development/me/plans/${created.planId}/actions/${mentoringAction.id}`, {
        method: "PATCH",
        body: JSON.stringify({ progressPercent: 100, employeeNotes: "Mentoria concluída." }),
    });
    await request(`/api/v1/trainings/me/enrollments/${created.trainingEnrollmentId}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progressPercent: 100 }),
    });

    const completedPlan = await request(`/api/v1/development/me/plans/${created.planId}`);
    assert.equal(completedPlan.payload.data.plan.status, "completed");
    assert.equal(completedPlan.payload.data.plan.progressPercent, 100);
    const myCareer = await request("/api/v1/development/me/career");
    assert.equal(myCareer.payload.data.profile.readinessPercent, 100);
    assert.equal(myCareer.payload.data.profile.targetLevelId, targetLevelId);
    const dashboard = await request("/api/v1/dashboard");
    assert.ok(dashboard.payload.data.dashboard.development);

    console.log("Fluxo de PDI e carreira validado com sucesso.");
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
