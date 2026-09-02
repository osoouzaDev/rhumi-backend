import database from "../database/connection.js";
import type { AuthenticationContext } from "./auth.repository.js";

interface AutomationRecipientRow {
    user_id: string;
    employee_id: string;
    company_id: string;
    department_id: string;
    position_id: string;
    employee_code: string;
    full_name: string;
    email: string;
    roles: string[];
    permissions: string[];
}

export class NotificationAutomationRepository {
    async listRecipients(companyId: string): Promise<AuthenticationContext[]> {
        const result = await database.query<AutomationRecipientRow>(
            `SELECT users.id AS user_id, employees.id AS employee_id,
                    employees.company_id, employees.department_id, employees.position_id,
                    employees.employee_code, employees.full_name, employees.email,
                    ARRAY(
                        SELECT DISTINCT roles.code
                        FROM user_roles
                        INNER JOIN roles ON roles.id = user_roles.role_id
                        WHERE user_roles.user_id = users.id
                        ORDER BY roles.code
                    ) AS roles,
                    ARRAY(
                        SELECT effective_permissions.permission_code
                        FROM (
                            SELECT permissions.code AS permission_code
                            FROM user_roles
                            INNER JOIN role_permissions
                                ON role_permissions.role_id = user_roles.role_id
                            INNER JOIN permissions
                                ON permissions.id = role_permissions.permission_id
                            WHERE user_roles.user_id = users.id
                            UNION
                            SELECT permissions.code
                            FROM user_permission_overrides
                            INNER JOIN permissions
                                ON permissions.id = user_permission_overrides.permission_id
                            WHERE user_permission_overrides.user_id = users.id
                              AND user_permission_overrides.effect = 'allow'
                            EXCEPT
                            SELECT permissions.code
                            FROM user_permission_overrides
                            INNER JOIN permissions
                                ON permissions.id = user_permission_overrides.permission_id
                            WHERE user_permission_overrides.user_id = users.id
                              AND user_permission_overrides.effect = 'deny'
                        ) AS effective_permissions
                        ORDER BY effective_permissions.permission_code
                    ) AS permissions
             FROM users
             INNER JOIN employees ON employees.id = users.employee_id
             WHERE employees.company_id = $1
               AND users.status = 'active' AND users.deleted_at IS NULL
               AND users.activated_at IS NOT NULL AND users.email_verified_at IS NOT NULL
               AND employees.status = 'active' AND employees.deleted_at IS NULL`,
            [companyId],
        );
        return result.rows.map((row) => ({
            userId: row.user_id,
            sessionId: "00000000-0000-0000-0000-000000000000",
            employeeId: row.employee_id,
            companyId: row.company_id,
            departmentId: row.department_id,
            positionId: row.position_id,
            employeeCode: row.employee_code,
            fullName: row.full_name,
            email: row.email,
            roles: row.roles,
            permissions: row.permissions,
            mfaEnabled: true,
        }));
    }

    async queueImmediate(companyId: string): Promise<number> {
        const result = await database.query(
            `WITH eligible AS (
                SELECT notifications.id, notifications.recipient_user_id,
                       employees.email, employees.full_name,
                       notifications.title, notifications.description,
                       notifications.action_url
                FROM notifications
                INNER JOIN users ON users.id = notifications.recipient_user_id
                INNER JOIN employees ON employees.id = users.employee_id
                INNER JOIN notification_preferences
                    ON notification_preferences.user_id = users.id
                WHERE notifications.company_id = $1
                  AND notifications.email_queued_at IS NULL
                  AND notifications.dismissed_at IS NULL
                  AND notifications.resolved_at IS NULL
                  AND (notifications.expires_at IS NULL OR notifications.expires_at > NOW())
                  AND notification_preferences.email_enabled = TRUE
                  AND notification_preferences.digest_frequency = 'immediate'
                  AND (
                    notification_preferences.notify_low_priority = TRUE
                    OR notifications.priority <> 'low'
                  )
                FOR UPDATE OF notifications SKIP LOCKED
             ), queued AS (
                INSERT INTO email_outbox (
                    company_id, recipient, template, subject, payload
                )
                SELECT $1, eligible.email, 'notification_immediate', eligible.title,
                       jsonb_build_object(
                           'notificationId', eligible.id,
                           'fullName', eligible.full_name,
                           'title', eligible.title,
                           'description', eligible.description,
                           'actionUrl', eligible.action_url
                       )
                FROM eligible
                RETURNING (payload->>'notificationId')::UUID AS notification_id
             )
             UPDATE notifications
             SET email_queued_at = NOW()
             WHERE id IN (SELECT notification_id FROM queued)`,
            [companyId],
        );
        return result.rowCount ?? 0;
    }

    async queueReminders(companyId: string): Promise<number> {
        const result = await database.query(
            `WITH eligible AS (
                SELECT notifications.id, employees.email, employees.full_name,
                       notifications.title, notifications.description,
                       notifications.action_url
                FROM notifications
                INNER JOIN users ON users.id = notifications.recipient_user_id
                INNER JOIN employees ON employees.id = users.employee_id
                INNER JOIN notification_preferences
                    ON notification_preferences.user_id = users.id
                WHERE notifications.company_id = $1
                  AND notifications.due_at IS NOT NULL
                  AND notifications.dismissed_at IS NULL
                  AND notifications.resolved_at IS NULL
                  AND notification_preferences.email_enabled = TRUE
                  AND notification_preferences.digest_frequency <> 'off'
                  AND (
                    (notifications.due_at AT TIME ZONE notification_preferences.timezone)::DATE
                    - (NOW() AT TIME ZONE notification_preferences.timezone)::DATE
                  ) = ANY(notification_preferences.reminder_days)
                  AND (
                    notifications.last_reminded_at IS NULL
                    OR (notifications.last_reminded_at
                        AT TIME ZONE notification_preferences.timezone)::DATE
                       < (NOW() AT TIME ZONE notification_preferences.timezone)::DATE
                  )
                FOR UPDATE OF notifications SKIP LOCKED
             ), queued AS (
                INSERT INTO email_outbox (
                    company_id, recipient, template, subject, payload
                )
                SELECT $1, eligible.email, 'notification_reminder',
                       'Lembrete: ' || eligible.title,
                       jsonb_build_object(
                           'notificationId', eligible.id,
                           'fullName', eligible.full_name,
                           'title', eligible.title,
                           'description', eligible.description,
                           'actionUrl', eligible.action_url
                       )
                FROM eligible
                RETURNING (payload->>'notificationId')::UUID AS notification_id
             )
             UPDATE notifications
             SET last_reminded_at = NOW()
             WHERE id IN (SELECT notification_id FROM queued)`,
            [companyId],
        );
        return result.rowCount ?? 0;
    }

    async queueDigests(companyId: string): Promise<number> {
        const result = await database.query(
            `WITH candidates AS (
                SELECT users.id AS user_id, employees.email, employees.full_name,
                       notification_preferences.digest_frequency,
                       notification_preferences.timezone,
                       CASE notification_preferences.digest_frequency
                           WHEN 'daily' THEN TO_CHAR(
                               NOW() AT TIME ZONE notification_preferences.timezone,
                               'YYYY-MM-DD'
                           )
                           ELSE TO_CHAR(
                               NOW() AT TIME ZONE notification_preferences.timezone,
                               'IYYY-IW'
                           )
                       END AS period_key
                FROM users
                INNER JOIN employees ON employees.id = users.employee_id
                INNER JOIN notification_preferences
                    ON notification_preferences.user_id = users.id
                WHERE employees.company_id = $1
                  AND users.status = 'active' AND users.deleted_at IS NULL
                  AND notification_preferences.email_enabled = TRUE
                  AND notification_preferences.digest_frequency IN ('daily', 'weekly')
                  AND (NOW() AT TIME ZONE notification_preferences.timezone)::TIME >= TIME '08:00'
                  AND EXISTS (
                    SELECT 1 FROM notifications
                    WHERE notifications.recipient_user_id = users.id
                      AND notifications.dismissed_at IS NULL
                      AND notifications.resolved_at IS NULL
                      AND notifications.read_at IS NULL
                      AND (notifications.expires_at IS NULL OR notifications.expires_at > NOW())
                  )
             ), deliveries AS (
                INSERT INTO notification_digest_deliveries (
                    company_id, user_id, frequency, period_key
                )
                SELECT $1, candidates.user_id, candidates.digest_frequency,
                       candidates.period_key
                FROM candidates
                ON CONFLICT (user_id, frequency, period_key) DO NOTHING
                RETURNING user_id, frequency, period_key
             )
             INSERT INTO email_outbox (
                company_id, recipient, template, subject, payload
             )
             SELECT $1, candidates.email, 'notification_digest',
                    CASE candidates.digest_frequency
                        WHEN 'daily' THEN 'Resumo diário RHumi'
                        ELSE 'Resumo semanal RHumi'
                    END,
                    jsonb_build_object(
                        'fullName', candidates.full_name,
                        'actionUrl', '/notifications',
                        'items', (
                            SELECT jsonb_agg(jsonb_build_object(
                                'title', notifications.title,
                                'description', notifications.description,
                                'priority', notifications.priority
                            ) ORDER BY notifications.created_at DESC)
                            FROM (
                                SELECT * FROM notifications
                                WHERE notifications.recipient_user_id = candidates.user_id
                                  AND notifications.dismissed_at IS NULL
                                  AND notifications.resolved_at IS NULL
                                  AND notifications.read_at IS NULL
                                  AND (notifications.expires_at IS NULL
                                       OR notifications.expires_at > NOW())
                                ORDER BY notifications.created_at DESC
                                LIMIT 100
                            ) AS notifications
                        )
                    )
             FROM deliveries
             INNER JOIN candidates
                ON candidates.user_id = deliveries.user_id
               AND candidates.digest_frequency = deliveries.frequency
               AND candidates.period_key = deliveries.period_key`,
            [companyId],
        );
        return result.rowCount ?? 0;
    }
}

export const notificationAutomationRepository = new NotificationAutomationRepository();
