import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    createJourneyTemplateSchema,
    updateJourneyTaskSchema,
} from "../dist/schemas/journeys.schemas.js";

const trainingId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";

test("valida um modelo de onboarding com tarefas manuais, reunião e treinamento", () => {
    const template = createJourneyTemplateSchema.parse({
        code: "ONBOARDING-30",
        name: "Onboarding de 30 dias",
        description: "Integração estruturada para novos colaboradores da empresa.",
        kind: "onboarding",
        durationDays: 30,
        stages: [{
            name: "Primeiros passos",
            tasks: [
                { title: "Ler o guia", dueAfterDays: 0 },
                { title: "Reunião com liderança", taskType: "meeting", responsible: "owner",
                    dueAfterDays: 1, meetingTime: "09:00", meetingDurationMinutes: 30 },
                { title: "Treinamento obrigatório", taskType: "training", dueAfterDays: 5,
                    trainingId },
            ],
        }],
    });
    assert.equal(template.status, "draft");
    assert.equal(template.stages[0].tasks[0].taskType, "manual");
    assert.equal(template.stages[0].tasks[0].responsible, "collaborator");
});

test("rejeita tarefas incompletas e prazos fora da jornada", () => {
    assert.equal(createJourneyTemplateSchema.safeParse({
        code: "INVALID-1",
        name: "Modelo inválido",
        description: "Descrição suficientemente longa para passar pela validação.",
        kind: "onboarding",
        durationDays: 5,
        stages: [{ name: "Início", tasks: [{
            title: "Reunião sem horário", taskType: "meeting", dueAfterDays: 1,
        }] }],
    }).success, false);
    assert.equal(createJourneyTemplateSchema.safeParse({
        code: "INVALID-2",
        name: "Modelo inválido",
        description: "Descrição suficientemente longa para passar pela validação.",
        kind: "onboarding",
        durationDays: 5,
        stages: [{ name: "Início", tasks: [{ title: "Tarefa atrasada", dueAfterDays: 6 }] }],
    }).success, false);
    assert.equal(updateJourneyTaskSchema.safeParse({}).success, false);
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
        "/api/v1/journeys/templates",
        "/api/v1/journeys/assignments",
        "/api/v1/journeys/me",
    ]) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
