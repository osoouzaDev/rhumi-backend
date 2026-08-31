import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    assignTrainingEnrollmentsSchema,
    createTrainingClassSchema,
    createTrainingSchema,
    submitTrainingExamSchema,
    upsertTrainingExamSchema,
} from "../dist/schemas/trainings.schemas.js";

const employeeId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";

test("valida um treinamento e aplica os valores padrão", () => {
    const training = createTrainingSchema.parse({
        code: "LGPD-001",
        title: "Fundamentos da LGPD",
        description: "Treinamento corporativo sobre proteção e tratamento de dados pessoais.",
        modality: "online",
        workloadMinutes: 120,
        materials: [{
            title: "Apostila",
            type: "document",
            url: "https://example.com/lgpd.pdf",
        }],
    });
    assert.equal(training.status, "draft");
    assert.equal(training.materials.length, 1);
});

test("rejeita turma com período invertido e colaboradores repetidos", () => {
    assert.equal(createTrainingClassSchema.safeParse({
        name: "Turma inválida",
        startsAt: "2026-10-10T10:00:00-04:00",
        endsAt: "2026-10-10T09:00:00-04:00",
    }).success, false);
    assert.equal(assignTrainingEnrollmentsSchema.safeParse({
        employeeIds: [employeeId, employeeId],
    }).success, false);
});

test("valida prova, alternativas corretas e respostas", () => {
    const exam = upsertTrainingExamSchema.parse({
        title: "Avaliação final",
        published: true,
        questions: [{
            prompt: "A LGPD protege dados pessoais?",
            questionType: "true_false",
            options: [
                { text: "Verdadeiro", isCorrect: true },
                { text: "Falso", isCorrect: false },
            ],
        }],
    });
    assert.equal(exam.passingScore, 70);
    assert.equal(exam.maxAttempts, 3);

    assert.equal(upsertTrainingExamSchema.safeParse({
        title: "Prova inválida",
        questions: [{
            prompt: "Escolha uma alternativa",
            questionType: "single_choice",
            options: [
                { text: "A", isCorrect: true },
                { text: "B", isCorrect: true },
            ],
        }],
    }).success, false);
    assert.equal(submitTrainingExamSchema.safeParse({ answers: [] }).success, false);
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
    const paths = [
        "/api/v1/trainings",
        "/api/v1/trainings/classes",
        "/api/v1/trainings/me/enrollments",
    ];
    for (const path of paths) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
