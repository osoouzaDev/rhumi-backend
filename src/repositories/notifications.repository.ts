import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { AuthenticationContext } from "./auth.repository.js";
import type { AuditActor } from "./organization.repository.js";
import type {
    CreateNotificationAnnouncementInput,
    NotificationListQuery,
} from "../schemas/notifications.schemas.js";

export type NotificationType =
    | "journey" | "training" | "calendar" | "evaluation" | "development"
    | "recruitment" | "announcement" | "system";
export type NotificationPriority = "low" | "normal" | "high" | "urgent";
export type NotificationDigestFrequency = "immediate" | "daily" | "weekly" | "off";

export interface Notification {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    description: string;
    actionUrl: string | null;
    sourceType: string;
    sourceId: string;
    dueAt: Date | null;
    expiresAt: Date | null;
    readAt: Date | null;
    resolvedAt: Date | null;
    isOverdue: boolean;
    automatic: boolean;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}

export interface NotificationPreferences {
    inAppEnabled: boolean;
    emailEnabled: boolean;
    digestFrequency: NotificationDigestFrequency;
    reminderDays: number[];
    notifyLowPriority: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    timezone: string;
    updatedAt: Date | null;
}

export interface NotificationSummary {
    total: number;
    unread: number;
    read: number;
    urgent: number;
    overdue: number;
    dueToday: number;
    byType: Record<NotificationType, number>;
}

export interface NotificationDashboardMetrics {
    unreadNotifications: number;
    urgentNotifications: number;
    overdueNotifications: number;
    dueTodayNotifications: number;
}

export interface NotificationAnnouncement {
    id: string;
    audienceType: "company" | "department" | "employees";
    departmentId: string | null;
    title: string;
    description: string;
    priority: NotificationPriority;
    actionUrl: string | null;
    expiresAt: Date | null;
    createdAt: Date;
    deliveredCount: number;
}

interface NotificationRow {
    id: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    description: string;
    action_url: string | null;
    source_type: string;
    source_id: string;
    due_at: Date | null;
    expires_at: Date | null;
    read_at: Date | null;
    resolved_at: Date | null;
    is_overdue: boolean;
    automatic: boolean;
    metadata: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    total: number;
}

interface PreferenceRow {
    in_app_enabled: boolean;
    email_enabled: boolean;
    digest_frequency: NotificationDigestFrequency;
    reminder_days: number[];
    notify_low_priority: boolean;
    quiet_hours_start: string | null;
    quiet_hours_end: string | null;
    timezone: string;
    updated_at: Date;
}

interface SummaryRow {
    total: number;
    unread: number;
    read: number;
    urgent: number;
    overdue: number;
    due_today: number;
    journey: number;
    training: number;
    calendar: number;
    evaluation: number;
    development: number;
    recruitment: number;
    announcement: number;
    system: number;
}

interface RecipientRow {
    user_id: string;
    employee_id: string;
    department_id: string;
}

const notificationColumns = `
    notifications.id, notifications.type, notifications.priority,
    notifications.title, notifications.description, notifications.action_url,
    notifications.source_type, notifications.source_id, notifications.due_at,
    notifications.expires_at, notifications.read_at, notifications.resolved_at,
    (notifications.resolved_at IS NULL AND notifications.due_at < NOW()) AS is_overdue,
    notifications.automatic, notifications.metadata, notifications.created_at,
    notifications.updated_at
`;

const mapNotification = (row: NotificationRow): Notification => ({
    id: row.id,
    type: row.type,
    priority: row.priority,
    title: row.title,
    description: row.description,
    actionUrl: row.action_url,
    sourceType: row.source_type,
    sourceId: row.source_id,
    dueAt: row.due_at,
    expiresAt: row.expires_at,
    readAt: row.read_at,
    resolvedAt: row.resolved_at,
    isOverdue: row.is_overdue,
    automatic: row.automatic,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const defaultPreferences = (): NotificationPreferences => ({
    inAppEnabled: true,
    emailEnabled: false,
    digestFrequency: "immediate",
    reminderDays: [0, 1, 3, 7],
    notifyLowPriority: true,
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: "America/Cuiaba",
    updatedAt: null,
});

const mapPreferences = (row?: PreferenceRow): NotificationPreferences => row ? ({
    inAppEnabled: row.in_app_enabled,
    emailEnabled: row.email_enabled,
    digestFrequency: row.digest_frequency,
    reminderDays: row.reminder_days,
    notifyLowPriority: row.notify_low_priority,
    quietHoursStart: row.quiet_hours_start?.slice(0, 5) ?? null,
    quietHoursEnd: row.quiet_hours_end?.slice(0, 5) ?? null,
    timezone: row.timezone,
    updatedAt: row.updated_at,
}) : defaultPreferences();

const activePendingSql = `
    SELECT DISTINCT ON (active_pending.source_type, active_pending.source_id)
        active_pending.*
    FROM (
        SELECT
            'journey'::notification_type AS type,
            (CASE
                WHEN journey_tasks.due_at < NOW() THEN 'urgent'
                WHEN journey_tasks.status = 'blocked' OR journey_tasks.due_at <= NOW() + INTERVAL '3 days'
                    THEN 'high'
                ELSE 'normal'
            END)::notification_priority AS priority,
            journey_template_tasks.title::TEXT AS title,
            ('Tarefa pendente da jornada "' || journey_templates.name || '".')::TEXT AS description,
            ('/journeys/me/' || journey_assignments.id)::TEXT AS action_url,
            'journey.task'::TEXT AS source_type,
            journey_tasks.id AS source_id,
            journey_tasks.due_at AS due_at,
            jsonb_build_object(
                'assignmentId', journey_assignments.id,
                'taskStatus', journey_tasks.status
            ) AS metadata
        FROM journey_tasks
        JOIN journey_assignments ON journey_assignments.id = journey_tasks.assignment_id
        JOIN journey_template_tasks ON journey_template_tasks.id = journey_tasks.template_task_id
        JOIN journey_template_stages ON journey_template_stages.id = journey_template_tasks.stage_id
        JOIN journey_templates ON journey_templates.id = journey_template_stages.template_id
        WHERE journey_tasks.company_id = $1
          AND journey_tasks.responsible_employee_id = $3
          AND journey_tasks.status IN ('pending', 'in_progress', 'blocked')
          AND journey_assignments.status IN ('planned', 'in_progress', 'overdue')
          AND journey_assignments.deleted_at IS NULL

        UNION ALL

        SELECT
            'training'::notification_type,
            (CASE
                WHEN training_classes.ends_at < NOW() THEN 'urgent'
                WHEN training_classes.starts_at <= NOW() + INTERVAL '3 days' THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            trainings.title::TEXT,
            ('Treinamento atribuído na turma "' || training_classes.name || '".')::TEXT,
            ('/trainings/me/enrollments/' || training_enrollments.id)::TEXT,
            'training.enrollment'::TEXT,
            training_enrollments.id,
            training_classes.starts_at,
            jsonb_build_object(
                'classId', training_classes.id,
                'progressPercent', training_enrollments.progress_percent
            )
        FROM training_enrollments
        JOIN training_classes ON training_classes.id = training_enrollments.class_id
        JOIN trainings ON trainings.id = training_classes.training_id
        WHERE training_enrollments.company_id = $1
          AND training_enrollments.employee_id = $3
          AND training_enrollments.status IN ('assigned', 'in_progress')
          AND training_enrollments.deleted_at IS NULL
          AND training_classes.status IN ('open', 'in_progress')
          AND training_classes.deleted_at IS NULL
          AND trainings.deleted_at IS NULL

        UNION ALL

        SELECT
            'calendar'::notification_type,
            (CASE
                WHEN calendar_events.starts_at <= NOW() THEN 'urgent'
                WHEN calendar_events.starts_at <= NOW() + INTERVAL '1 day' THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            ('Responder convite: ' || calendar_events.title)::TEXT,
            COALESCE(calendar_events.description, 'Confirme sua participação no evento.')::TEXT,
            ('/calendar/events/' || calendar_events.id)::TEXT,
            'calendar.response'::TEXT,
            calendar_events.id,
            calendar_events.starts_at,
            jsonb_build_object('eventType', calendar_events.event_type)
        FROM calendar_event_attendees
        JOIN calendar_events ON calendar_events.id = calendar_event_attendees.event_id
        WHERE calendar_events.company_id = $1
          AND calendar_event_attendees.employee_id = $3
          AND calendar_event_attendees.response = 'pending'
          AND calendar_events.status = 'scheduled'
          AND calendar_events.ends_at >= NOW()
          AND calendar_events.deleted_at IS NULL

        UNION ALL

        SELECT
            'evaluation'::notification_type,
            (CASE
                WHEN evaluation_cycles.self_review_deadline < CURRENT_DATE THEN 'urgent'
                WHEN evaluation_cycles.self_review_deadline <= CURRENT_DATE + 3 THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            ('Realizar autoavaliação: ' || evaluation_cycles.name)::TEXT,
            'Preencha sua autoavaliação dentro do prazo do ciclo.'::TEXT,
            ('/evaluations/me/' || evaluation_assignments.id)::TEXT,
            'evaluation.self_review'::TEXT,
            evaluation_assignments.id,
            (((evaluation_cycles.self_review_deadline + 1)::TIMESTAMP
                AT TIME ZONE 'America/Cuiaba') - INTERVAL '1 second')::TIMESTAMPTZ,
            jsonb_build_object('cycleId', evaluation_cycles.id)
        FROM evaluation_assignments
        JOIN evaluation_cycles ON evaluation_cycles.id = evaluation_assignments.cycle_id
        WHERE evaluation_assignments.company_id = $1
          AND evaluation_assignments.employee_id = $3
          AND evaluation_assignments.status IN ('pending', 'self_review')
          AND evaluation_assignments.deleted_at IS NULL
          AND evaluation_cycles.status IN ('scheduled', 'active')
          AND evaluation_cycles.deleted_at IS NULL

        UNION ALL

        SELECT
            'evaluation'::notification_type,
            (CASE
                WHEN evaluation_cycles.manager_review_deadline < CURRENT_DATE THEN 'urgent'
                WHEN evaluation_cycles.manager_review_deadline <= CURRENT_DATE + 3 THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            ('Avaliar ' || employees.full_name || ': ' || evaluation_cycles.name)::TEXT,
            'A avaliação do gestor está aguardando sua resposta.'::TEXT,
            ('/evaluations/assignments/' || evaluation_assignments.id)::TEXT,
            'evaluation.manager_review'::TEXT,
            evaluation_assignments.id,
            (((evaluation_cycles.manager_review_deadline + 1)::TIMESTAMP
                AT TIME ZONE 'America/Cuiaba') - INTERVAL '1 second')::TIMESTAMPTZ,
            jsonb_build_object('cycleId', evaluation_cycles.id, 'employeeId', employees.id)
        FROM evaluation_assignments
        JOIN evaluation_cycles ON evaluation_cycles.id = evaluation_assignments.cycle_id
        JOIN employees ON employees.id = evaluation_assignments.employee_id
        WHERE evaluation_assignments.company_id = $1
          AND evaluation_assignments.evaluator_employee_id = $3
          AND evaluation_assignments.status = 'manager_review'
          AND evaluation_assignments.deleted_at IS NULL
          AND evaluation_cycles.status IN ('scheduled', 'active')
          AND evaluation_cycles.deleted_at IS NULL

        UNION ALL

        SELECT
            'evaluation'::notification_type,
            (CASE
                WHEN evaluation_cycles.feedback_deadline < CURRENT_DATE THEN 'urgent'
                WHEN evaluation_cycles.feedback_deadline <= CURRENT_DATE + 3 THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            ('Feedback pendente: ' || evaluation_cycles.name)::TEXT,
            'A conversa de feedback desta avaliação ainda precisa ser concluída.'::TEXT,
            (CASE WHEN evaluation_assignments.evaluator_employee_id = $3
                THEN '/evaluations/assignments/' ELSE '/evaluations/me/'
             END || evaluation_assignments.id)::TEXT,
            'evaluation.feedback'::TEXT,
            evaluation_assignments.id,
            (((evaluation_cycles.feedback_deadline + 1)::TIMESTAMP
                AT TIME ZONE 'America/Cuiaba') - INTERVAL '1 second')::TIMESTAMPTZ,
            jsonb_build_object('cycleId', evaluation_cycles.id)
        FROM evaluation_assignments
        JOIN evaluation_cycles ON evaluation_cycles.id = evaluation_assignments.cycle_id
        WHERE evaluation_assignments.company_id = $1
          AND $3 IN (evaluation_assignments.employee_id, evaluation_assignments.evaluator_employee_id)
          AND evaluation_assignments.status = 'feedback_pending'
          AND evaluation_assignments.deleted_at IS NULL
          AND evaluation_cycles.status IN ('scheduled', 'active')
          AND evaluation_cycles.deleted_at IS NULL

        UNION ALL

        SELECT
            'development'::notification_type,
            (CASE
                WHEN development_actions.due_at < NOW() THEN 'urgent'
                WHEN development_actions.status = 'blocked'
                    OR development_actions.due_at <= NOW() + INTERVAL '3 days' THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            development_actions.title::TEXT,
            ('Ação pendente do plano "' || development_plans.title || '".')::TEXT,
            ('/development/me/plans/' || development_plans.id)::TEXT,
            'development.action'::TEXT,
            development_actions.id,
            development_actions.due_at,
            jsonb_build_object(
                'planId', development_plans.id,
                'progressPercent', development_actions.progress_percent
            )
        FROM development_actions
        JOIN development_objectives ON development_objectives.id = development_actions.objective_id
        JOIN development_plans ON development_plans.id = development_objectives.plan_id
        WHERE development_actions.company_id = $1
          AND development_actions.responsible_employee_id = $3
          AND development_actions.status IN ('not_started', 'in_progress', 'blocked')
          AND development_plans.status IN ('active', 'overdue')
          AND development_plans.deleted_at IS NULL

        UNION ALL

        SELECT
            'recruitment'::notification_type,
            (CASE
                WHEN job_applications.stage IN ('interview', 'offer') THEN 'high'
                ELSE 'normal'
            END)::notification_priority,
            ('Acompanhar candidatura de ' || candidates.full_name)::TEXT,
            ('Etapa atual: ' || job_applications.stage::TEXT || ' — vaga "'
                || vacancies.title || '".')::TEXT,
            ('/recruitment/applications/' || job_applications.id)::TEXT,
            'recruitment.application'::TEXT,
            job_applications.id,
            NULL::TIMESTAMPTZ,
            jsonb_build_object(
                'vacancyId', vacancies.id,
                'candidateId', candidates.id,
                'stage', job_applications.stage
            )
        FROM job_applications
        JOIN vacancies ON vacancies.id = job_applications.vacancy_id
        JOIN candidates ON candidates.id = job_applications.candidate_id
        WHERE $4::BOOLEAN
          AND job_applications.company_id = $1
          AND job_applications.created_by = $2
          AND job_applications.status = 'active'
          AND job_applications.stage NOT IN ('hired', 'rejected')
          AND job_applications.deleted_at IS NULL
          AND vacancies.deleted_at IS NULL
          AND candidates.deleted_at IS NULL
    ) AS active_pending
    WHERE COALESCE((
        SELECT notification_preferences.in_app_enabled
        FROM notification_preferences
        WHERE notification_preferences.user_id = $2
    ), TRUE)
    ORDER BY active_pending.source_type, active_pending.source_id
`;

const addAnnouncementAuditLog = async (
    client: PoolClient,
    companyId: string,
    announcementId: string,
    actor: AuditActor,
    deliveredCount: number,
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, 'notification.announcement.created',
            'notification_announcement', $3, $4, $5::JSONB)`,
        [companyId, actor.userId, announcementId, actor.requestId ?? null,
            JSON.stringify({ deliveredCount })],
    );
};

export class NotificationsRepository {
    async syncAutomatic(context: AuthenticationContext): Promise<void> {
        const parameters = [
            context.companyId,
            context.userId,
            context.employeeId,
            context.permissions.includes("recruitment.manage"),
        ];
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `WITH pending AS (${activePendingSql})
                 INSERT INTO notifications (
                    company_id, recipient_user_id, recipient_employee_id,
                    type, priority, title, description, action_url,
                    source_type, source_id, due_at, automatic, metadata
                 )
                 SELECT $1, $2, $3, pending.type, pending.priority, pending.title,
                    pending.description, pending.action_url, pending.source_type,
                    pending.source_id, pending.due_at, TRUE, pending.metadata
                 FROM pending
                 ON CONFLICT (recipient_user_id, source_type, source_id) DO UPDATE SET
                    type = EXCLUDED.type,
                    priority = EXCLUDED.priority,
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    action_url = EXCLUDED.action_url,
                    due_at = EXCLUDED.due_at,
                    metadata = EXCLUDED.metadata,
                    read_at = CASE
                        WHEN notifications.resolved_at IS NOT NULL THEN NULL
                        WHEN notifications.priority <> EXCLUDED.priority
                          AND EXCLUDED.priority IN ('high', 'urgent') THEN NULL
                        ELSE notifications.read_at
                    END,
                    resolved_at = NULL
                 WHERE notifications.dismissed_at IS NULL`,
                parameters,
            );
            await client.query(
                `WITH pending AS (${activePendingSql})
                 UPDATE notifications
                 SET resolved_at = NOW()
                 WHERE notifications.company_id = $1
                   AND notifications.recipient_user_id = $2
                   AND notifications.automatic = TRUE
                   AND notifications.dismissed_at IS NULL
                   AND notifications.resolved_at IS NULL
                   AND NOT EXISTS (
                        SELECT 1 FROM pending
                        WHERE pending.source_type = notifications.source_type
                          AND pending.source_id = notifications.source_id
                   )`,
                parameters,
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async list(context: AuthenticationContext, query: NotificationListQuery) {
        const values: unknown[] = [context.companyId, context.userId];
        const conditions = [
            "notifications.company_id = $1",
            "notifications.recipient_user_id = $2",
            "notifications.dismissed_at IS NULL",
        ];
        if (!query.includeResolved) {
            conditions.push("notifications.resolved_at IS NULL");
            conditions.push("(notifications.expires_at IS NULL OR notifications.expires_at > NOW())");
        }
        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(notifications.title ILIKE $${values.length}
                OR notifications.description ILIKE $${values.length})`);
        }
        if (query.type) {
            values.push(query.type);
            conditions.push(`notifications.type = $${values.length}`);
        }
        if (query.priority) {
            values.push(query.priority);
            conditions.push(`notifications.priority = $${values.length}`);
        }
        if (query.status === "unread") conditions.push("notifications.read_at IS NULL");
        if (query.status === "read") conditions.push("notifications.read_at IS NOT NULL");
        if (query.dueBefore) {
            values.push(query.dueBefore);
            conditions.push(`notifications.due_at <= $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<NotificationRow>(
            `SELECT ${notificationColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM notifications
             WHERE ${conditions.join(" AND ")}
             ORDER BY
                CASE WHEN notifications.due_at < NOW()
                    AND notifications.resolved_at IS NULL THEN 0 ELSE 1 END,
                CASE notifications.priority
                    WHEN 'urgent' THEN 1 WHEN 'high' THEN 2
                    WHEN 'normal' THEN 3 ELSE 4 END,
                notifications.due_at ASC NULLS LAST,
                notifications.created_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return { items: result.rows.map(mapNotification), total: result.rows[0]?.total ?? 0 };
    }

    async getSummary(context: AuthenticationContext): Promise<NotificationSummary> {
        const result = await database.query<SummaryRow>(
            `SELECT
                COUNT(*)::INTEGER AS total,
                COUNT(*) FILTER (WHERE read_at IS NULL)::INTEGER AS unread,
                COUNT(*) FILTER (WHERE read_at IS NOT NULL)::INTEGER AS read,
                COUNT(*) FILTER (WHERE priority = 'urgent')::INTEGER AS urgent,
                COUNT(*) FILTER (WHERE due_at < NOW())::INTEGER AS overdue,
                COUNT(*) FILTER (WHERE due_at >= DATE_TRUNC('day', NOW())
                    AND due_at < DATE_TRUNC('day', NOW()) + INTERVAL '1 day')::INTEGER AS due_today,
                COUNT(*) FILTER (WHERE type = 'journey')::INTEGER AS journey,
                COUNT(*) FILTER (WHERE type = 'training')::INTEGER AS training,
                COUNT(*) FILTER (WHERE type = 'calendar')::INTEGER AS calendar,
                COUNT(*) FILTER (WHERE type = 'evaluation')::INTEGER AS evaluation,
                COUNT(*) FILTER (WHERE type = 'development')::INTEGER AS development,
                COUNT(*) FILTER (WHERE type = 'recruitment')::INTEGER AS recruitment,
                COUNT(*) FILTER (WHERE type = 'announcement')::INTEGER AS announcement,
                COUNT(*) FILTER (WHERE type = 'system')::INTEGER AS system
             FROM notifications
             WHERE company_id = $1
               AND recipient_user_id = $2
               AND dismissed_at IS NULL
               AND resolved_at IS NULL
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [context.companyId, context.userId],
        );
        const row = result.rows[0];
        return {
            total: row?.total ?? 0,
            unread: row?.unread ?? 0,
            read: row?.read ?? 0,
            urgent: row?.urgent ?? 0,
            overdue: row?.overdue ?? 0,
            dueToday: row?.due_today ?? 0,
            byType: {
                journey: row?.journey ?? 0,
                training: row?.training ?? 0,
                calendar: row?.calendar ?? 0,
                evaluation: row?.evaluation ?? 0,
                development: row?.development ?? 0,
                recruitment: row?.recruitment ?? 0,
                announcement: row?.announcement ?? 0,
                system: row?.system ?? 0,
            },
        };
    }

    async markRead(context: AuthenticationContext, notificationId: string): Promise<boolean> {
        const result = await database.query(
            `UPDATE notifications SET read_at = COALESCE(read_at, NOW())
             WHERE id = $1 AND company_id = $2 AND recipient_user_id = $3
               AND dismissed_at IS NULL`,
            [notificationId, context.companyId, context.userId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async markUnread(context: AuthenticationContext, notificationId: string): Promise<boolean> {
        const result = await database.query(
            `UPDATE notifications SET read_at = NULL
             WHERE id = $1 AND company_id = $2 AND recipient_user_id = $3
               AND dismissed_at IS NULL`,
            [notificationId, context.companyId, context.userId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async markAllRead(context: AuthenticationContext): Promise<number> {
        const result = await database.query(
            `UPDATE notifications SET read_at = NOW()
             WHERE company_id = $1 AND recipient_user_id = $2
               AND dismissed_at IS NULL AND resolved_at IS NULL AND read_at IS NULL
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [context.companyId, context.userId],
        );
        return result.rowCount ?? 0;
    }

    async dismiss(context: AuthenticationContext, notificationId: string): Promise<boolean> {
        const result = await database.query(
            `UPDATE notifications SET dismissed_at = NOW()
             WHERE id = $1 AND company_id = $2 AND recipient_user_id = $3
               AND dismissed_at IS NULL`,
            [notificationId, context.companyId, context.userId],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async getPreferences(context: AuthenticationContext): Promise<NotificationPreferences> {
        const result = await database.query<PreferenceRow>(
            `SELECT in_app_enabled, email_enabled, digest_frequency, reminder_days,
                    notify_low_priority, quiet_hours_start, quiet_hours_end, timezone, updated_at
             FROM notification_preferences
             WHERE user_id = $1 AND company_id = $2`,
            [context.userId, context.companyId],
        );
        return mapPreferences(result.rows[0]);
    }

    async savePreferences(
        context: AuthenticationContext,
        preferences: Omit<NotificationPreferences, "updatedAt">,
    ): Promise<NotificationPreferences> {
        const result = await database.query<PreferenceRow>(
            `INSERT INTO notification_preferences (
                user_id, company_id, in_app_enabled, email_enabled, digest_frequency,
                reminder_days, notify_low_priority, quiet_hours_start, quiet_hours_end, timezone
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (user_id) DO UPDATE SET
                in_app_enabled = EXCLUDED.in_app_enabled,
                email_enabled = EXCLUDED.email_enabled,
                digest_frequency = EXCLUDED.digest_frequency,
                reminder_days = EXCLUDED.reminder_days,
                notify_low_priority = EXCLUDED.notify_low_priority,
                quiet_hours_start = EXCLUDED.quiet_hours_start,
                quiet_hours_end = EXCLUDED.quiet_hours_end,
                timezone = EXCLUDED.timezone
             RETURNING in_app_enabled, email_enabled, digest_frequency, reminder_days,
                notify_low_priority, quiet_hours_start, quiet_hours_end, timezone, updated_at`,
            [
                context.userId, context.companyId, preferences.inAppEnabled,
                preferences.emailEnabled, preferences.digestFrequency, preferences.reminderDays,
                preferences.notifyLowPriority, preferences.quietHoursStart,
                preferences.quietHoursEnd, preferences.timezone,
            ],
        );
        return mapPreferences(result.rows[0]);
    }

    async findEligibleRecipients(
        companyId: string,
        departmentId?: string,
        employeeIds?: string[],
    ): Promise<RecipientRow[]> {
        const result = await database.query<RecipientRow>(
            `SELECT users.id AS user_id, employees.id AS employee_id,
                    employees.department_id
             FROM users
             JOIN employees ON employees.id = users.employee_id
             WHERE employees.company_id = $1
               AND ($2::UUID IS NULL OR employees.department_id = $2)
               AND ($3::UUID[] IS NULL OR employees.id = ANY($3::UUID[]))
               AND users.status = 'active'
               AND users.deleted_at IS NULL
               AND employees.status <> 'inactive'
               AND employees.deleted_at IS NULL`,
            [companyId, departmentId ?? null, employeeIds ?? null],
        );
        return result.rows;
    }

    async createAnnouncement(
        context: AuthenticationContext,
        input: CreateNotificationAnnouncementInput,
        departmentId: string | null,
        recipients: RecipientRow[],
        actor: AuditActor,
    ): Promise<NotificationAnnouncement> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const announcementResult = await client.query<{
                id: string; created_at: Date;
            }>(
                `INSERT INTO notification_announcements (
                    company_id, department_id, audience_type, title, description,
                    priority, action_url, expires_at, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING id, created_at`,
                [
                    context.companyId, departmentId, input.audienceType,
                    input.title, input.description, input.priority,
                    input.actionUrl ?? null, input.expiresAt ?? null, actor.userId,
                ],
            );
            const announcementId = announcementResult.rows[0].id;
            await client.query(
                `INSERT INTO notifications (
                    company_id, recipient_user_id, recipient_employee_id,
                    type, priority, title, description, action_url,
                    source_type, source_id, expires_at, automatic, metadata, created_by
                 )
                 SELECT $1, recipient.user_id, recipient.employee_id,
                    'announcement', $2, $3, $4, $5,
                    'notification.announcement', $6, $7, FALSE,
                    jsonb_build_object('audienceType', $8::TEXT), $9
                 FROM UNNEST($10::UUID[], $11::UUID[])
                    AS recipient(user_id, employee_id)`,
                [
                    context.companyId, input.priority, input.title, input.description,
                    input.actionUrl ?? null, announcementId, input.expiresAt ?? null,
                    input.audienceType, actor.userId,
                    recipients.map((recipient) => recipient.user_id),
                    recipients.map((recipient) => recipient.employee_id),
                ],
            );
            await addAnnouncementAuditLog(
                client, context.companyId, announcementId, actor, recipients.length,
            );
            await client.query("COMMIT");
            return {
                id: announcementId,
                audienceType: input.audienceType,
                departmentId,
                title: input.title,
                description: input.description,
                priority: input.priority,
                actionUrl: input.actionUrl ?? null,
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                createdAt: announcementResult.rows[0].created_at,
                deliveredCount: recipients.length,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getDashboardMetrics(
        context: AuthenticationContext,
    ): Promise<NotificationDashboardMetrics> {
        await this.syncAutomatic(context);
        const summary = await this.getSummary(context);
        return {
            unreadNotifications: summary.unread,
            urgentNotifications: summary.urgent,
            overdueNotifications: summary.overdue,
            dueTodayNotifications: summary.dueToday,
        };
    }
}

export const notificationsRepository = new NotificationsRepository();
