import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    calendarEventListQuerySchema,
    createCalendarEventSchema,
    respondCalendarEventSchema,
    updateCalendarEventSchema,
} from "../dist/schemas/calendar.schemas.js";

const departmentId = "7f4a48c4-e67f-4b24-a4fc-87f236951213";
const employeeId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";

test("valida um evento e aplica os valores padrão", () => {
    const event = createCalendarEventSchema.parse({
        departmentId,
        title: "Reunião semanal do RH",
        startsAt: "2026-09-01T09:00:00-04:00",
        endsAt: "2026-09-01T10:00:00-04:00",
        attendeeEmployeeIds: [employeeId],
    });

    assert.equal(event.eventType, "meeting");
    assert.equal(event.visibility, "department");
    assert.equal(event.status, "scheduled");
    assert.equal(event.timezone, "America/Cuiaba");
});

test("rejeita períodos invertidos, participantes repetidos e atualização vazia", () => {
    assert.equal(createCalendarEventSchema.safeParse({
        title: "Evento inválido",
        startsAt: "2026-09-01T10:00:00-04:00",
        endsAt: "2026-09-01T09:00:00-04:00",
    }).success, false);

    assert.equal(createCalendarEventSchema.safeParse({
        title: "Evento com participante repetido",
        startsAt: "2026-09-01T09:00:00-04:00",
        endsAt: "2026-09-01T10:00:00-04:00",
        attendeeEmployeeIds: [employeeId, employeeId],
    }).success, false);
    assert.equal(updateCalendarEventSchema.safeParse({}).success, false);
});

test("limita a consulta a um ano e aceita respostas válidas", () => {
    assert.equal(calendarEventListQuerySchema.safeParse({
        from: "2026-01-01T00:00:00-04:00",
        to: "2027-01-03T00:00:00-04:00",
    }).success, false);
    assert.equal(respondCalendarEventSchema.parse({ response: "accepted" }).response, "accepted");
    assert.equal(respondCalendarEventSchema.safeParse({ response: "pending" }).success, false);
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

test("protege as rotas do calendário", async () => {
    const paths = [
        "/api/v1/calendar/events",
        "/api/v1/calendar/events/upcoming",
    ];
    for (const path of paths) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
