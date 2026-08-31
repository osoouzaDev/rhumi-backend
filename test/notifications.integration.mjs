import assert from "node:assert/strict";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import migrationDatabase, { closeMigrationDatabase } from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
let accessToken;
let userId;
let employeeId;
let eventId;
let announcementId;
let originalPreferences;

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
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        if (eventId) {
            await client.query(
                "DELETE FROM notifications WHERE source_type = 'calendar.response' AND source_id = $1",
                [eventId],
            );
        }
        if (announcementId) {
            await client.query(
                "DELETE FROM notifications WHERE source_type = 'notification.announcement' AND source_id = $1",
                [announcementId],
            );
            await client.query("DELETE FROM notification_announcements WHERE id = $1", [announcementId]);
        }
        if (eventId) {
            await client.query("DELETE FROM calendar_event_attendees WHERE event_id = $1", [eventId]);
            await client.query("DELETE FROM calendar_events WHERE id = $1", [eventId]);
        }
        if (userId) {
            if (originalPreferences) {
                await client.query(
                    `INSERT INTO notification_preferences (
                        user_id, company_id, in_app_enabled, email_enabled,
                        digest_frequency, reminder_days, notify_low_priority,
                        quiet_hours_start, quiet_hours_end, timezone, updated_at
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                     ON CONFLICT (user_id) DO UPDATE SET
                        company_id = EXCLUDED.company_id,
                        in_app_enabled = EXCLUDED.in_app_enabled,
                        email_enabled = EXCLUDED.email_enabled,
                        digest_frequency = EXCLUDED.digest_frequency,
                        reminder_days = EXCLUDED.reminder_days,
                        notify_low_priority = EXCLUDED.notify_low_priority,
                        quiet_hours_start = EXCLUDED.quiet_hours_start,
                        quiet_hours_end = EXCLUDED.quiet_hours_end,
                        timezone = EXCLUDED.timezone,
                        updated_at = EXCLUDED.updated_at`,
                    [
                        userId, originalPreferences.company_id,
                        originalPreferences.in_app_enabled, originalPreferences.email_enabled,
                        originalPreferences.digest_frequency, originalPreferences.reminder_days,
                        originalPreferences.notify_low_priority,
                        originalPreferences.quiet_hours_start, originalPreferences.quiet_hours_end,
                        originalPreferences.timezone, originalPreferences.updated_at,
                    ],
                );
            } else {
                await client.query("DELETE FROM notification_preferences WHERE user_id = $1", [userId]);
            }
        }
        const ids = [eventId, announcementId].filter(Boolean);
        if (ids.length > 0) {
            await client.query("DELETE FROM audit_logs WHERE entity_id = ANY($1::UUID[])", [ids]);
        }
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
    userId = me.payload.data.user.id;
    employeeId = me.payload.data.user.employeeId;
    const departmentId = me.payload.data.user.departmentId;
    const preferencesResult = await database.query(
        "SELECT * FROM notification_preferences WHERE user_id = $1",
        [userId],
    );
    originalPreferences = preferencesResult.rows[0] ?? null;

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const startsAt = new Date(Date.now() + 2 * 60 * 60 * 1_000);
    const event = await request("/api/v1/calendar/events", {
        method: "POST",
        body: JSON.stringify({
            departmentId,
            title: `Convite notificÃ¡vel ${suffix}`,
            description: "Evento temporÃ¡rio para validar a central de pendÃªncias.",
            eventType: "meeting",
            visibility: "participants",
            startsAt: startsAt.toISOString(),
            endsAt: new Date(startsAt.getTime() + 30 * 60 * 1_000).toISOString(),
            attendeeEmployeeIds: [employeeId],
        }),
    });
    eventId = event.payload.data.event.id;

    const listed = await request(
        `/api/v1/notifications?type=calendar&status=unread&search=${encodeURIComponent(suffix)}`,
    );
    assert.equal(listed.payload.data.notifications.length, 1);
    const calendarNotification = listed.payload.data.notifications[0];
    assert.equal(calendarNotification.sourceId, eventId);
    assert.equal(calendarNotification.priority, "high");
    assert.equal(calendarNotification.isOverdue, false);

    await request(`/api/v1/notifications/${calendarNotification.id}/read`, { method: "PATCH" });
    const readList = await request(
        `/api/v1/notifications?type=calendar&status=read&search=${encodeURIComponent(suffix)}`,
    );
    assert.equal(readList.payload.data.notifications.length, 1);
    await request(`/api/v1/notifications/${calendarNotification.id}/unread`, { method: "PATCH" });

    const preferences = await request("/api/v1/notifications/preferences", {
        method: "PUT",
        body: JSON.stringify({
            emailEnabled: true,
            digestFrequency: "daily",
            reminderDays: [0, 2, 5],
            quietHoursStart: "22:00",
            quietHoursEnd: "07:00",
        }),
    });
    assert.equal(preferences.payload.data.preferences.digestFrequency, "daily");
    assert.deepEqual(preferences.payload.data.preferences.reminderDays, [0, 2, 5]);

    const announcement = await request("/api/v1/notifications/announcements", {
        method: "POST",
        body: JSON.stringify({
            audienceType: "employees",
            employeeIds: [employeeId],
            title: `Comunicado temporÃ¡rio ${suffix}`,
            description: "Comunicado criado para validar a entrega individual de notificaÃ§Ãµes.",
            priority: "urgent",
        }),
    });
    announcementId = announcement.payload.data.announcement.id;
    assert.equal(announcement.payload.data.announcement.deliveredCount, 1);

    const announcementList = await request(
        `/api/v1/notifications?type=announcement&search=${encodeURIComponent(suffix)}`,
    );
    assert.equal(announcementList.payload.data.notifications.length, 1);
    const announcementNotification = announcementList.payload.data.notifications[0];
    await request(`/api/v1/notifications/${announcementNotification.id}`, { method: "DELETE" });

    const summary = await request("/api/v1/notifications/summary");
    assert.ok(Number.isInteger(summary.payload.data.summary.unread));
    assert.ok(summary.payload.data.summary.byType.calendar >= 1);

    const dashboard = await request("/api/v1/dashboard");
    assert.ok(dashboard.payload.data.dashboard.notifications);

    await request(`/api/v1/calendar/events/${eventId}/response`, {
        method: "PATCH",
        body: JSON.stringify({ response: "accepted" }),
    });
    const afterResolution = await request(
        `/api/v1/notifications?type=calendar&search=${encodeURIComponent(suffix)}`,
    );
    assert.equal(afterResolution.payload.data.notifications.length, 0);
    const history = await request(
        `/api/v1/notifications?type=calendar&includeResolved=true&search=${encodeURIComponent(suffix)}`,
    );
    assert.equal(history.payload.data.notifications.length, 1);
    assert.ok(history.payload.data.notifications[0].resolvedAt);

    console.log("Fluxo de notificaÃ§Ãµes e pendÃªncias validado com sucesso.");
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
