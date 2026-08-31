import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let accessToken;
let eventId;

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
    if (!eventId) return;
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM audit_logs WHERE entity_id = $1", [eventId]);
        await client.query("DELETE FROM calendar_events WHERE id = $1", [eventId]);
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
    assert.ok(employeeId);
    assert.ok(departmentId);

    const startsAt = new Date(Date.now() + 48 * 60 * 60 * 1_000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1_000);
    const from = new Date(startsAt.getTime() - 24 * 60 * 60 * 1_000).toISOString();
    const to = new Date(endsAt.getTime() + 24 * 60 * 60 * 1_000).toISOString();
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

    const created = await request("/api/v1/calendar/events", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            title: `Evento temporÃ¡rio ${suffix}`,
            description: "Evento criado exclusivamente para o teste integrado do calendÃ¡rio.",
            eventType: "meeting",
            visibility: "department",
            location: "Sala de teste",
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            timezone: "America/Cuiaba",
            attendeeEmployeeIds: [employeeId],
        }),
    });
    eventId = created.payload.data.event.id;
    assert.equal(created.response.status, 201);

    const listed = await request(`/api/v1/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    assert.ok(listed.payload.data.events.some((event) => event.id === eventId));

    const upcoming = await request("/api/v1/calendar/events/upcoming?limit=50");
    assert.ok(upcoming.payload.data.events.some((event) => event.id === eventId));

    const responded = await request(`/api/v1/calendar/events/${eventId}/response`, {
        method: "PATCH",
        body: JSON.stringify({ response: "accepted" }),
    });
    const attendee = responded.payload.data.event.attendees.find(
        (item) => item.employeeId === employeeId,
    );
    assert.equal(attendee.response, "accepted");

    const updated = await request(`/api/v1/calendar/events/${eventId}`, {
        method: "PATCH",
        body: JSON.stringify({ title: `Evento atualizado ${suffix}` }),
    });
    assert.equal(updated.payload.data.event.title, `Evento atualizado ${suffix}`);

    const dashboard = await request("/api/v1/dashboard");
    assert.ok(dashboard.payload.data.dashboard.calendar);

    const removed = await request(`/api/v1/calendar/events/${eventId}`, { method: "DELETE" });
    assert.equal(removed.response.status, 204);

    console.log("Fluxo do calendÃ¡rio corporativo validado com sucesso.");
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
