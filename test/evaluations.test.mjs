import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    createEvaluationCycleSchema,
    scheduleEvaluationFeedbackSchema,
    submitSelfReviewSchema,
} from "../dist/schemas/evaluations.schemas.js";

const competencyId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";

test("valida um ciclo de desempenho com competências ponderadas", () => {
    const cycle = createEvaluationCycleSchema.parse({
        code: "AVALIACAO-2026",
        name: "Avaliação anual 2026",
        description: "Ciclo anual de avaliação de desempenho dos colaboradores.",
        status: "active",
        startsOn: "2026-08-01",
        selfReviewDeadline: "2026-08-31",
        managerReviewDeadline: "2026-09-15",
        feedbackDeadline: "2026-09-30",
        competencies: [
            { name: "Colaboração", description: "Coopera com a equipe e compartilha conhecimento.",
                category: "behavioral", weight: 40 },
            { name: "Entrega", description: "Entrega resultados com qualidade e previsibilidade.",
                category: "technical", weight: 60 },
        ],
    });
    assert.equal(cycle.selfWeight, 30);
    assert.equal(cycle.managerWeight, 70);
    assert.equal(cycle.competencies.length, 2);
});

test("rejeita datas, pesos e respostas duplicadas", () => {
    assert.equal(createEvaluationCycleSchema.safeParse({
        code: "INVALID",
        name: "Ciclo inválido",
        description: "Descrição suficientemente longa para validação do ciclo.",
        startsOn: "2026-09-01",
        selfReviewDeadline: "2026-08-01",
        managerReviewDeadline: "2026-09-15",
        feedbackDeadline: "2026-09-30",
        competencies: [{ name: "Entrega", description: "Descrição válida da competência.",
            category: "technical", weight: 90 }],
    }).success, false);
    assert.equal(submitSelfReviewSchema.safeParse({
        responses: [
            { competencyId, score: 4 },
            { competencyId, score: 5 },
        ],
    }).success, false);
    assert.equal(scheduleEvaluationFeedbackSchema.safeParse({
        startsAt: "2026-09-10T10:00:00-04:00",
        endsAt: "2026-09-10T09:00:00-04:00",
    }).success, false);
});

let server;
let baseUrl;

before(() => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
}));

test("protege as áreas de gestão e do colaborador", async () => {
    for (const path of [
        "/api/v1/evaluations/cycles",
        "/api/v1/evaluations/assignments",
        "/api/v1/evaluations/me",
    ]) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
