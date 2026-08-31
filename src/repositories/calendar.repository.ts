import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    CalendarEventListQuery,
    CreateCalendarEventInput,
    UpdateCalendarEventInput,
    UpcomingCalendarEventsQuery,
} from "../schemas/calendar.schemas.js";
import type { AuthenticationContext } from "./auth.repository.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export type CalendarEventType = CreateCalendarEventInput["eventType"];
export type CalendarEventVisibility = CreateCalendarEventInput["visibility"];
export type CalendarEventStatus = CreateCalendarEventInput["status"];
export type CalendarAttendeeResponse = "pending" | "accepted" | "declined" | "tentative";

export interface CalendarAttendee {
    employeeId: string;
    fullName: string;
    email: string;
    departmentId: string;
    response: CalendarAttendeeResponse;
    respondedAt: Date | null;
}

export interface CalendarEvent {
    id: string;
    companyId: string;
    departmentId: string | null;
    departmentName: string | null;
    title: string;
    description: string | null;
    eventType: CalendarEventType;
    visibility: CalendarEventVisibility;
    status: CalendarEventStatus;
    location: string | null;
    meetingUrl: string | null;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    timezone: string;
    createdBy: string | null;
    createdByName: string | null;
    attendees: CalendarAttendee[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CalendarDashboardMetrics {
    todayEvents: number;
    nextSevenDays: number;
    pendingResponses: number;
}

interface AttendeeJson {
    employeeId: string;
    fullName: string;
    email: string;
    departmentId: string;
    response: CalendarAttendeeResponse;
    respondedAt: string | null;
}

interface CalendarEventRow {
    id: string;
    company_id: string;
    department_id: string | null;
    department_name: string | null;
    title: string;
    description: string | null;
    event_type: CalendarEventType;
    visibility: CalendarEventVisibility;
    status: CalendarEventStatus;
    location: string | null;
    meeting_url: string | null;
    starts_at: Date;
    ends_at: Date;
    all_day: boolean;
    timezone: string;
    created_by: string | null;
    created_by_name: string | null;
    attendees: AttendeeJson[];
    created_at: Date;
    updated_at: Date;
    total?: number;
}

const eventColumns = `
    calendar_events.id,
    calendar_events.company_id,
    calendar_events.department_id,
    departments.name AS department_name,
    calendar_events.title,
    calendar_events.description,
    calendar_events.event_type,
    calendar_events.visibility,
    calendar_events.status,
    calendar_events.location,
    calendar_events.meeting_url,
    calendar_events.starts_at,
    calendar_events.ends_at,
    calendar_events.all_day,
    calendar_events.timezone,
    calendar_events.created_by,
    creator_employee.full_name AS created_by_name,
    calendar_events.created_at,
    calendar_events.updated_at,
    COALESCE(attendee_data.attendees, '[]'::JSONB) AS attendees
`;

const eventJoins = `
    LEFT JOIN departments ON departments.id = calendar_events.department_id
    LEFT JOIN users AS creator_user ON creator_user.id = calendar_events.created_by
    LEFT JOIN employees AS creator_employee ON creator_employee.id = creator_user.employee_id
    LEFT JOIN LATERAL (
        SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'employeeId', employees.id,
                'fullName', employees.full_name,
                'email', employees.email,
                'departmentId', employees.department_id,
                'response', calendar_event_attendees.response,
                'respondedAt', calendar_event_attendees.responded_at
            ) ORDER BY employees.full_name
        ) AS attendees
        FROM calendar_event_attendees
        INNER JOIN employees ON employees.id = calendar_event_attendees.employee_id
        WHERE calendar_event_attendees.event_id = calendar_events.id
          AND employees.deleted_at IS NULL
    ) AS attendee_data ON TRUE
`;

const accessCondition = `(
    $7::BOOLEAN
    OR calendar_events.visibility = 'company'
    OR (calendar_events.visibility = 'department' AND calendar_events.department_id = $4)
    OR calendar_events.created_by = $5
    OR EXISTS (
        SELECT 1
        FROM calendar_event_attendees AS access_attendees
        WHERE access_attendees.event_id = calendar_events.id
          AND access_attendees.employee_id = $6
    )
)`;

const upcomingAccessCondition = `(
    $6::BOOLEAN
    OR calendar_events.visibility = 'company'
    OR (calendar_events.visibility = 'department' AND calendar_events.department_id = $3)
    OR calendar_events.created_by = $4
    OR EXISTS (
        SELECT 1
        FROM calendar_event_attendees AS access_attendees
        WHERE access_attendees.event_id = calendar_events.id
          AND access_attendees.employee_id = $5
    )
)`;

const detailAccessCondition = `(
    $6::BOOLEAN
    OR calendar_events.visibility = 'company'
    OR (calendar_events.visibility = 'department' AND calendar_events.department_id = $3)
    OR calendar_events.created_by = $4
    OR EXISTS (
        SELECT 1
        FROM calendar_event_attendees AS access_attendees
        WHERE access_attendees.event_id = calendar_events.id
          AND access_attendees.employee_id = $5
    )
)`;

const mapEvent = (row: CalendarEventRow): CalendarEvent => ({
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    title: row.title,
    description: row.description,
    eventType: row.event_type,
    visibility: row.visibility,
    status: row.status,
    location: row.location,
    meetingUrl: row.meeting_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    timezone: row.timezone,
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    attendees: row.attendees.map((attendee) => ({
        ...attendee,
        respondedAt: attendee.respondedAt ? new Date(attendee.respondedAt) : null,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);

const accessValues = (
    context: AuthenticationContext,
    from: string,
    to: string,
): unknown[] => [
    context.companyId,
    from,
    to,
    context.departmentId,
    context.userId,
    context.employeeId,
    isAdministrator(context),
];

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    eventId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'calendar_event', $4, $5, $6::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            eventId,
            actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const replaceAttendees = async (
    client: PoolClient,
    eventId: string,
    employeeIds: string[],
): Promise<void> => {
    await client.query("DELETE FROM calendar_event_attendees WHERE event_id = $1", [eventId]);
    if (employeeIds.length > 0) {
        await client.query(
            `INSERT INTO calendar_event_attendees (event_id, employee_id)
             SELECT $1, employee_id
             FROM UNNEST($2::UUID[]) AS employee_id`,
            [eventId, employeeIds],
        );
    }
};

export class CalendarRepository {
    async list(
        context: AuthenticationContext,
        query: CalendarEventListQuery,
    ): Promise<PaginatedResult<CalendarEvent>> {
        const values = accessValues(context, query.from, query.to);
        const conditions = [
            "calendar_events.company_id = $1",
            "calendar_events.starts_at < $3",
            "calendar_events.ends_at > $2",
            "calendar_events.deleted_at IS NULL",
            accessCondition,
        ];

        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(
                calendar_events.title ILIKE $${values.length}
                OR calendar_events.description ILIKE $${values.length}
                OR calendar_events.location ILIKE $${values.length}
            )`);
        }
        if (query.departmentId) {
            values.push(query.departmentId);
            conditions.push(`calendar_events.department_id = $${values.length}`);
        }
        if (query.eventType) {
            values.push(query.eventType);
            conditions.push(`calendar_events.event_type = $${values.length}`);
        }
        if (query.status) {
            values.push(query.status);
            conditions.push(`calendar_events.status = $${values.length}`);
        }

        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<CalendarEventRow>(
            `SELECT ${eventColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM calendar_events
             ${eventJoins}
             WHERE ${conditions.join(" AND ")}
             ORDER BY calendar_events.starts_at ASC, calendar_events.title ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );

        return {
            items: result.rows.map(mapEvent),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async listUpcoming(
        context: AuthenticationContext,
        query: UpcomingCalendarEventsQuery,
    ): Promise<CalendarEvent[]> {
        const values: unknown[] = [
            context.companyId,
            new Date().toISOString(),
            context.departmentId,
            context.userId,
            context.employeeId,
            isAdministrator(context),
        ];
        const conditions = [
            "calendar_events.company_id = $1",
            "calendar_events.ends_at >= $2",
            "calendar_events.status = 'scheduled'",
            "calendar_events.deleted_at IS NULL",
            upcomingAccessCondition,
        ];
        if (query.eventType) {
            values.push(query.eventType);
            conditions.push(`calendar_events.event_type = $${values.length}`);
        }
        values.push(query.limit);

        const result = await database.query<CalendarEventRow>(
            `SELECT ${eventColumns}
             FROM calendar_events
             ${eventJoins}
             WHERE ${conditions.join(" AND ")}
             ORDER BY calendar_events.starts_at ASC, calendar_events.title ASC
             LIMIT $${values.length}`,
            values,
        );
        return result.rows.map(mapEvent);
    }

    async findById(
        context: AuthenticationContext,
        eventId: string,
    ): Promise<CalendarEvent | null> {
        const result = await database.query<CalendarEventRow>(
            `SELECT ${eventColumns}
             FROM calendar_events
             ${eventJoins}
             WHERE calendar_events.company_id = $1
               AND calendar_events.id = $2
               AND calendar_events.deleted_at IS NULL
               AND ${detailAccessCondition}
             LIMIT 1`,
            [
                context.companyId,
                eventId,
                context.departmentId,
                context.userId,
                context.employeeId,
                isAdministrator(context),
            ],
        );
        return result.rows[0] ? mapEvent(result.rows[0]) : null;
    }

    async create(
        context: AuthenticationContext,
        input: CreateCalendarEventInput,
        departmentId: string | null,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO calendar_events (
                    company_id, department_id, title, description, event_type,
                    visibility, status, location, meeting_url, starts_at, ends_at,
                    all_day, timezone, created_by, updated_by
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14
                 ) RETURNING id`,
                [
                    context.companyId,
                    departmentId,
                    input.title,
                    input.description ?? null,
                    input.eventType,
                    input.visibility,
                    input.status,
                    input.location ?? null,
                    input.meetingUrl ?? null,
                    input.startsAt,
                    input.endsAt,
                    input.allDay,
                    input.timezone,
                    actor.userId,
                ],
            );
            const eventId = result.rows[0].id;
            await replaceAttendees(client, eventId, input.attendeeEmployeeIds);
            await addAuditLog(client, context.companyId, actor, "calendar.event.created", eventId);
            await client.query("COMMIT");
            return eventId;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        context: AuthenticationContext,
        eventId: string,
        input: UpdateCalendarEventInput,
        departmentId: string | null | undefined,
        actor: AuditActor,
    ): Promise<boolean> {
        const values: unknown[] = [];
        const assignments: string[] = [];
        const columns: Record<string, string> = {
            title: "title",
            description: "description",
            eventType: "event_type",
            visibility: "visibility",
            status: "status",
            location: "location",
            meetingUrl: "meeting_url",
            startsAt: "starts_at",
            endsAt: "ends_at",
            allDay: "all_day",
            timezone: "timezone",
        };
        for (const [field, column] of Object.entries(columns)) {
            const value = input[field as keyof UpdateCalendarEventInput];
            if (value !== undefined) {
                values.push(value);
                assignments.push(`${column} = $${values.length}`);
            }
        }
        if (departmentId !== undefined) {
            values.push(departmentId);
            assignments.push(`department_id = $${values.length}`);
        }
        values.push(actor.userId);
        assignments.push(`updated_by = $${values.length}`);
        values.push(eventId, context.companyId);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE calendar_events
                 SET ${assignments.join(", ")}
                 WHERE id = $${values.length - 1}
                   AND company_id = $${values.length}
                   AND deleted_at IS NULL
                 RETURNING id`,
                values,
            );
            if (!result.rows[0]) {
                await client.query("ROLLBACK");
                return false;
            }
            if (input.attendeeEmployeeIds !== undefined) {
                await replaceAttendees(client, eventId, input.attendeeEmployeeIds);
            }
            await addAuditLog(
                client,
                context.companyId,
                actor,
                "calendar.event.updated",
                eventId,
                Object.keys(input),
            );
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async archive(
        context: AuthenticationContext,
        eventId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE calendar_events
                 SET deleted_at = NOW(), updated_by = $3
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 RETURNING id`,
                [eventId, context.companyId, actor.userId],
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    context.companyId,
                    actor,
                    "calendar.event.archived",
                    eventId,
                );
            }
            await client.query("COMMIT");
            return Boolean(result.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async respond(
        context: AuthenticationContext,
        eventId: string,
        response: Exclude<CalendarAttendeeResponse, "pending">,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ event_id: string }>(
                `UPDATE calendar_event_attendees
                 SET response = $4, responded_at = NOW()
                 FROM calendar_events
                 WHERE calendar_event_attendees.event_id = calendar_events.id
                   AND calendar_event_attendees.event_id = $1
                   AND calendar_event_attendees.employee_id = $2
                   AND calendar_events.company_id = $3
                   AND calendar_events.deleted_at IS NULL
                 RETURNING calendar_event_attendees.event_id`,
                [eventId, context.employeeId, context.companyId, response],
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    context.companyId,
                    actor,
                    "calendar.event.responded",
                    eventId,
                    ["response"],
                );
            }
            await client.query("COMMIT");
            return Boolean(result.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async findActiveEmployeeIds(companyId: string, employeeIds: string[]): Promise<string[]> {
        if (employeeIds.length === 0) {
            return [];
        }
        const result = await database.query<{ id: string }>(
            `SELECT id
             FROM employees
             WHERE company_id = $1
               AND id = ANY($2::UUID[])
               AND status <> 'inactive'
               AND deleted_at IS NULL`,
            [companyId, employeeIds],
        );
        return result.rows.map((row) => row.id);
    }

    async getDashboardMetrics(
        context: AuthenticationContext,
    ): Promise<CalendarDashboardMetrics> {
        const result = await database.query<{
            today_events: number;
            next_seven_days: number;
            pending_responses: number;
        }>(
            `SELECT
                COUNT(*) FILTER (
                    WHERE calendar_events.starts_at < DATE_TRUNC('day', NOW()) + INTERVAL '1 day'
                      AND calendar_events.ends_at > DATE_TRUNC('day', NOW())
                )::INTEGER AS today_events,
                COUNT(*) FILTER (
                    WHERE calendar_events.starts_at < NOW() + INTERVAL '7 days'
                      AND calendar_events.ends_at >= NOW()
                )::INTEGER AS next_seven_days,
                COUNT(*) FILTER (
                    WHERE EXISTS (
                        SELECT 1
                        FROM calendar_event_attendees AS pending_attendees
                        WHERE pending_attendees.event_id = calendar_events.id
                          AND pending_attendees.employee_id = $5
                          AND pending_attendees.response = 'pending'
                    )
                )::INTEGER AS pending_responses
             FROM calendar_events
             WHERE calendar_events.company_id = $1
               AND calendar_events.status = 'scheduled'
               AND calendar_events.deleted_at IS NULL
               AND (
                    $6::BOOLEAN
                    OR calendar_events.visibility = 'company'
                    OR (calendar_events.visibility = 'department' AND calendar_events.department_id = $2)
                    OR calendar_events.created_by = $3
                    OR EXISTS (
                        SELECT 1
                        FROM calendar_event_attendees AS access_attendees
                        WHERE access_attendees.event_id = calendar_events.id
                          AND access_attendees.employee_id = $4
                    )
               )`,
            [
                context.companyId,
                context.departmentId,
                context.userId,
                context.employeeId,
                context.employeeId,
                isAdministrator(context),
            ],
        );
        const row = result.rows[0];
        return {
            todayEvents: row.today_events,
            nextSevenDays: row.next_seven_days,
            pendingResponses: row.pending_responses,
        };
    }
}

export const calendarRepository = new CalendarRepository();
