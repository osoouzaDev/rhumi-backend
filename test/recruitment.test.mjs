import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    createApplicationSchema,
    createCandidateSchema,
    createVacancySchema,
    updateApplicationSchema,
} from "../dist/schemas/recruitment.schemas.js";

const departmentId = "7f4a48c4-e67f-4b24-a4fc-87f236951213";
const positionId = "f92bef0e-1304-4c39-a5ae-55d5896d8d72";
const candidateId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";

test("valida uma vaga e aplica os valores padrão", () => {
    const vacancy = createVacancySchema.parse({
        departmentId,
        positionId,
        title: "Desenvolvedor Backend",
        description: "Desenvolvimento e manutenção das APIs do produto RHumi.",
        contractType: "clt",
        workModel: "remote",
    });

    assert.equal(vacancy.status, "draft");
    assert.equal(vacancy.openings, 1);
});

test("rejeita faixa salarial invertida e pontuação fora do limite", () => {
    assert.equal(createVacancySchema.safeParse({
        departmentId,
        positionId,
        title: "Desenvolvedor Backend",
        description: "Desenvolvimento e manutenção das APIs do produto RHumi.",
        contractType: "clt",
        workModel: "hybrid",
        salaryMin: 8_000,
        salaryMax: 7_000,
    }).success, false);

    assert.equal(createApplicationSchema.safeParse({
        candidateId,
        score: 101,
    }).success, false);
    assert.equal(updateApplicationSchema.safeParse({}).success, false);
});

test("normaliza o e-mail do candidato", () => {
    const candidate = createCandidateSchema.parse({
        fullName: "Maria Candidata",
        email: "MARIA.CANDIDATA@EXAMPLE.COM",
    });
    assert.equal(candidate.email, "maria.candidata@example.com");
});

let server;
let baseUrl;

before(() => {
    server = app.listen(0);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
}));

test("protege as rotas de recrutamento", async () => {
    const paths = [
        "/api/v1/recruitment/vacancies",
        "/api/v1/recruitment/candidates",
        "/api/v1/recruitment/applications",
    ];

    for (const path of paths) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
