import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import {
    createNotificationAnnouncementSchema,
    notificationListQuerySchema,
    updateNotificationPreferencesSchema,
} from "../dist/schemas/notifications.schemas.js";

const employeeId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";
const departmentId = "f92bef0e-1304-4c39-a5ae-55d5896d8d72";

test("normaliza os filtros da central de notificações", () => {
    const query = notificationListQuerySchema.parse({
        page: "2",
        pageSize: "10",
        status: "unread",
        includeResolved: "true",
        type: "development",
    });
    assert.equal(query.page, 2);
    assert.equal(query.pageSize, 10);
    assert.equal(query.status, "unread");
    assert.equal(query.includeResolved, true);
    assert.equal(query.type, "development");
});

test("valida o público dos comunicados internos", () => {
    const valid = createNotificationAnnouncementSchema.parse({
        audienceType: "employees",
        employeeIds: [employeeId],
        title: "Comunicado importante",
        description: "Mensagem destinada aos colaboradores selecionados.",
    });
    assert.equal(valid.priority, "normal");
    assert.equal(valid.employeeIds.length, 1);

    assert.equal(createNotificationAnnouncementSchema.safeParse({
        audienceType: "department",
        title: "Comunicado do setor",
        description: "Mensagem sem o setor obrigatório para este público.",
    }).success, false);
    assert.equal(createNotificationAnnouncementSchema.safeParse({
        audienceType: "company",
        departmentId,
        employeeIds: [employeeId],
        title: "Comunicado geral",
        description: "Mensagem com uma combinação inválida de destinatários.",
    }).success, false);
});

test("valida preferências e horários silenciosos", () => {
    assert.equal(updateNotificationPreferencesSchema.safeParse({
        reminderDays: [0, 1, 3, 7],
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
    }).success, true);
    assert.equal(updateNotificationPreferencesSchema.safeParse({
        reminderDays: [1, 1],
    }).success, false);
    assert.equal(updateNotificationPreferencesSchema.safeParse({}).success, false);
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

test("protege a central e a publicação de comunicados", async () => {
    for (const [method, path] of [
        ["GET", "/api/v1/notifications"],
        ["GET", "/api/v1/notifications/summary"],
        ["GET", "/api/v1/notifications/preferences"],
        ["POST", "/api/v1/notifications/announcements"],
    ]) {
        const response = await fetch(`${baseUrl}${path}`, { method });
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
