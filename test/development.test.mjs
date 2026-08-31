import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    createCareerTrackSchema,
    createDevelopmentPlanSchema,
} from "../dist/schemas/development.schemas.js";

const positionId = "f92bef0e-1304-4c39-a5ae-55d5896d8d72";
const employeeId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";
const trainingId = "7f4a48c4-e67f-4b24-a4fc-87f236951213";

test("valida uma trilha de carreira com níveis, competências e treinamento", () => {
    const track = createCareerTrackSchema.parse({
        code: "TECH-CAREER",
        name: "Carreira em Tecnologia",
        description: "Trilha de evolução profissional para a equipe de tecnologia.",
        levels: [{
            positionId,
            name: "Desenvolvedor Júnior",
            description: "Nível inicial da carreira de desenvolvimento de software.",
            competencies: [{
                name: "Qualidade de código",
                description: "Produz código legível, testado e de fácil manutenção.",
                category: "technical",
                requiredLevel: 3,
            }],
            trainings: [{ trainingId }],
        }],
    });
    assert.equal(track.status, "draft");
    assert.equal(track.levels[0].minimumMonthsExperience, 0);
    assert.equal(track.levels[0].trainings[0].required, true);
});

test("valida pesos, períodos e integrações obrigatórias do PDI", () => {
    const base = {
        employeeId,
        title: "PDI de desenvolvimento técnico",
        description: "Plano destinado ao desenvolvimento das competências técnicas prioritárias.",
        focusAreas: "Qualidade técnica e colaboração.",
        startsOn: "2026-08-01",
        targetEndOn: "2026-12-31",
    };
    assert.equal(createDevelopmentPlanSchema.safeParse({
        ...base,
        objectives: [{
            title: "Evolução técnica",
            description: "Aprimorar práticas de desenvolvimento de software.",
            successCriteria: "Concluir as ações previstas e aplicar o aprendizado.",
            weight: 90,
            targetDate: "2026-12-01",
            actions: [{
                actionType: "training",
                title: "Treinamento técnico",
                description: "Realizar o treinamento técnico definido no plano.",
                dueAt: "2026-10-01T12:00:00-04:00",
            }],
        }],
    }).success, false);
    assert.equal(createDevelopmentPlanSchema.safeParse({
        ...base,
        objectives: [{
            title: "Mentoria",
            description: "Realizar encontros periódicos de mentoria profissional.",
            successCriteria: "Concluir todos os encontros e registrar aprendizados.",
            weight: 100,
            targetDate: "2026-12-01",
            actions: [{
                actionType: "mentoring",
                title: "Primeiro encontro",
                description: "Encontro inicial para alinhamento do desenvolvimento.",
                dueAt: "2026-10-01T12:00:00-04:00",
                meetingEndsAt: "2026-10-01T11:00:00-04:00",
            }],
        }],
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
        "/api/v1/development/career-tracks",
        "/api/v1/development/plans",
        "/api/v1/development/me/plans",
        "/api/v1/development/me/career",
    ]) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
