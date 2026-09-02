import type { PoolClient } from "pg";
import database from "../database/connection.js";

export interface AuthenticationUser {
    id: string;
    employeeId: string;
    companyId: string;
    departmentId: string;
    positionId: string;
    employeeCode: string;
    fullName: string;
    email: string;
    passwordHash: string;
    status: "active" | "blocked" | "inactive";
    employeeStatus: "active" | "on_leave" | "inactive";
    companyActive: boolean;
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    activatedAt: Date | null;
    emailVerifiedAt: Date | null;
    isAdministrator: boolean;
}

export interface AuthenticationContext {
    userId: string;
    sessionId: string;
    employeeId: string;
    companyId: string;
    departmentId: string;
    positionId: string;
    employeeCode: string;
    fullName: string;
    email: string;
    roles: string[];
    permissions: string[];
    mfaEnabled: boolean;
}

export interface SessionMetadata {
    ipAddress?: string;
    userAgent?: string;
}

interface AuthenticationUserRow {
    id: string;
    employee_id: string;
    company_id: string;
    department_id: string;
    position_id: string;
    employee_code: string;
    full_name: string;
    email: string;
    password_hash: string;
    status: AuthenticationUser["status"];
    employee_status: AuthenticationUser["employeeStatus"];
    company_active: boolean;
    failed_login_attempts: number;
    locked_until: Date | null;
    activated_at: Date | null;
    email_verified_at: Date | null;
    is_administrator: boolean;
}

interface AuthenticationContextRow {
    user_id: string;
    session_id: string;
    employee_id: string;
    company_id: string;
    department_id: string;
    position_id: string;
    employee_code: string;
    full_name: string;
    email: string;
    roles: string[];
    permissions: string[];
    mfa_enabled: boolean;
}

interface SessionRow extends AuthenticationUserRow {
    session_id: string;
    session_expires_at: Date;
    session_revoked_at: Date | null;
    session_revocation_reason: string | null;
    session_replaced_by_session_id: string | null;
}

const mapAuthenticationUser = (row: AuthenticationUserRow): AuthenticationUser => ({
    id: row.id,
    employeeId: row.employee_id,
    companyId: row.company_id,
    departmentId: row.department_id,
    positionId: row.position_id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    employeeStatus: row.employee_status,
    companyActive: row.company_active,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    activatedAt: row.activated_at,
    emailVerifiedAt: row.email_verified_at,
    isAdministrator: row.is_administrator,
});

const authenticationUserSelect = `
    SELECT
        users.id,
        users.password_hash,
        users.status,
        users.failed_login_attempts,
        users.locked_until,
        users.activated_at,
        users.email_verified_at,
        EXISTS (
            SELECT 1 FROM user_roles
            INNER JOIN roles ON roles.id = user_roles.role_id
            WHERE user_roles.user_id = users.id
              AND LOWER(roles.code) = 'administrator'
        ) AS is_administrator,
        employees.id AS employee_id,
        employees.company_id,
        employees.department_id,
        employees.position_id,
        employees.employee_code,
        employees.full_name,
        employees.email,
        employees.status AS employee_status,
        companies.active AS company_active
    FROM users
    INNER JOIN employees ON employees.id = users.employee_id
    INNER JOIN companies ON companies.id = employees.company_id
`;

export class AuthRepository {
    async findUserByIdentifier(identifier: string): Promise<AuthenticationUser | null> {
        const result = await database.query<AuthenticationUserRow>(
            `${authenticationUserSelect}
            WHERE users.deleted_at IS NULL
              AND employees.deleted_at IS NULL
              AND companies.deleted_at IS NULL
              AND (
                  LOWER(employees.email) = LOWER($1)
                  OR LOWER(employees.employee_code) = LOWER($1)
              )
            LIMIT 1`,
            [identifier],
        );

        return result.rows[0] ? mapAuthenticationUser(result.rows[0]) : null;
    }

    async recordFailedLogin(
        userId: string,
        maximumAttempts: number,
        lockMinutes: number,
    ): Promise<void> {
        await database.query(
            `UPDATE users
             SET failed_login_attempts = failed_login_attempts + 1,
                 locked_until = CASE
                     WHEN failed_login_attempts + 1 >= $2
                         THEN NOW() + make_interval(mins => $3)
                     ELSE locked_until
                 END
             WHERE id = $1`,
            [userId, maximumAttempts, lockMinutes],
        );
    }

    async recordSuccessfulLogin(userId: string): Promise<void> {
        await database.query(
            `UPDATE users
             SET failed_login_attempts = 0,
                 locked_until = NULL,
                 last_login_at = NOW()
             WHERE id = $1`,
            [userId],
        );
    }

    async createSession(
        userId: string,
        refreshTokenHash: string,
        expiresAt: Date,
        metadata: SessionMetadata,
        maximumActiveSessions: number,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO sessions (
                    user_id, refresh_token_hash, expires_at, ip_address, user_agent
                 ) VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [
                    userId,
                    refreshTokenHash,
                    expiresAt,
                    metadata.ipAddress ?? null,
                    metadata.userAgent ?? null,
                ],
            );
            await this.limitActiveSessions(client, userId, maximumActiveSessions);
            await client.query("COMMIT");
            return result.rows[0].id;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async rotateSession(
        currentRefreshTokenHash: string,
        newRefreshTokenHash: string,
        newExpiresAt: Date,
        metadata: SessionMetadata,
        maximumActiveSessions: number,
    ): Promise<{ sessionId: string; user: AuthenticationUser } | null> {
        const client = await database.connect();

        try {
            await client.query("BEGIN");
            const session = await this.findSessionForUpdate(client, currentRefreshTokenHash);

            if (!session) {
                await client.query("ROLLBACK");
                return null;
            }
            if (session.session_revoked_at) {
                if (session.session_revocation_reason === "rotated") {
                    await this.revokeRotatedSessionChain(client, session);
                    await client.query("COMMIT");
                } else {
                    await client.query("ROLLBACK");
                }
                return null;
            }
            if (
                session.session_expires_at <= new Date()
                || session.status !== "active"
                || session.employee_status !== "active"
                || !session.company_active
            ) {
                await client.query("ROLLBACK");
                return null;
            }

            const newSessionResult = await client.query<{ id: string }>(
                `INSERT INTO sessions (
                    user_id,
                    refresh_token_hash,
                    expires_at,
                    ip_address,
                    user_agent
                 ) VALUES ($1, $2, $3, $4, $5)
                 RETURNING id`,
                [
                    session.id,
                    newRefreshTokenHash,
                    newExpiresAt,
                    metadata.ipAddress ?? null,
                    metadata.userAgent ?? null,
                ],
            );
            const newSessionId = newSessionResult.rows[0].id;

            await client.query(
                `UPDATE sessions
                 SET revoked_at = NOW(),
                     last_used_at = NOW(),
                     revocation_reason = 'rotated',
                     replaced_by_session_id = $2
                 WHERE id = $1`,
                [session.session_id, newSessionId],
            );
            await this.limitActiveSessions(client, session.id, maximumActiveSessions);

            await client.query("COMMIT");
            return {
                sessionId: newSessionId,
                user: mapAuthenticationUser(session),
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async findAuthenticationContext(
        sessionId: string,
        userId: string,
    ): Promise<AuthenticationContext | null> {
        const result = await database.query<AuthenticationContextRow>(
            `SELECT
                users.id AS user_id,
                sessions.id AS session_id,
                employees.id AS employee_id,
                employees.company_id,
                employees.department_id,
                employees.position_id,
                employees.employee_code,
                employees.full_name,
                employees.email,
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

                        SELECT permissions.code AS permission_code
                        FROM user_permission_overrides
                        INNER JOIN permissions
                            ON permissions.id = user_permission_overrides.permission_id
                        WHERE user_permission_overrides.user_id = users.id
                          AND user_permission_overrides.effect = 'allow'

                        EXCEPT

                        SELECT permissions.code AS permission_code
                        FROM user_permission_overrides
                        INNER JOIN permissions
                            ON permissions.id = user_permission_overrides.permission_id
                        WHERE user_permission_overrides.user_id = users.id
                          AND user_permission_overrides.effect = 'deny'
                    ) AS effective_permissions
                    ORDER BY effective_permissions.permission_code
                ) AS permissions,
                COALESCE((
                    SELECT user_mfa_settings.enabled
                    FROM user_mfa_settings
                    WHERE user_mfa_settings.user_id = users.id
                ), FALSE) AS mfa_enabled
             FROM sessions
             INNER JOIN users ON users.id = sessions.user_id
             INNER JOIN employees ON employees.id = users.employee_id
             INNER JOIN companies ON companies.id = employees.company_id
             WHERE sessions.id = $1
               AND users.id = $2
               AND sessions.revoked_at IS NULL
               AND sessions.expires_at > NOW()
               AND users.status = 'active'
               AND users.deleted_at IS NULL
               AND employees.status = 'active'
               AND employees.deleted_at IS NULL
               AND companies.active = TRUE
               AND companies.deleted_at IS NULL
             LIMIT 1`,
            [sessionId, userId],
        );

        const row = result.rows[0];
        if (!row) {
            return null;
        }

        return {
            userId: row.user_id,
            sessionId: row.session_id,
            employeeId: row.employee_id,
            companyId: row.company_id,
            departmentId: row.department_id,
            positionId: row.position_id,
            employeeCode: row.employee_code,
            fullName: row.full_name,
            email: row.email,
            roles: row.roles,
            permissions: row.permissions,
            mfaEnabled: row.mfa_enabled,
        };
    }

    async revokeSession(
        sessionId: string,
        userId: string,
        reason: string,
    ): Promise<void> {
        await database.query(
            `UPDATE sessions
             SET revoked_at = COALESCE(revoked_at, NOW()),
                 revocation_reason = COALESCE(revocation_reason, $3)
             WHERE id = $1 AND user_id = $2`,
            [sessionId, userId, reason],
        );
    }

    async revokeAllSessions(userId: string, reason: string): Promise<void> {
        await database.query(
            `UPDATE sessions
             SET revoked_at = COALESCE(revoked_at, NOW()),
                 revocation_reason = COALESCE(revocation_reason, $2)
             WHERE user_id = $1 AND revoked_at IS NULL`,
            [userId, reason],
        );
    }

    private async limitActiveSessions(
        client: PoolClient,
        userId: string,
        maximumActiveSessions: number,
    ): Promise<void> {
        await client.query(
            `WITH excess_sessions AS (
                SELECT id
                FROM sessions
                WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
                ORDER BY created_at DESC, id DESC
                OFFSET $2
             )
             UPDATE sessions
             SET revoked_at = NOW(), revocation_reason = 'active_session_limit'
             WHERE id IN (SELECT id FROM excess_sessions)`,
            [userId, maximumActiveSessions],
        );
    }

    private async revokeRotatedSessionChain(
        client: PoolClient,
        session: SessionRow,
    ): Promise<void> {
        await client.query(
            `WITH RECURSIVE descendants AS (
                SELECT replaced_by_session_id AS id
                FROM sessions
                WHERE id = $1 AND replaced_by_session_id IS NOT NULL

                UNION ALL

                SELECT sessions.replaced_by_session_id
                FROM sessions
                JOIN descendants ON sessions.id = descendants.id
                WHERE sessions.replaced_by_session_id IS NOT NULL
             )
             UPDATE sessions
             SET revoked_at = COALESCE(revoked_at, NOW()),
                 revocation_reason = CASE
                    WHEN revoked_at IS NULL THEN 'refresh_token_reuse'
                    ELSE revocation_reason
                 END
             WHERE id IN (SELECT id FROM descendants)`,
            [session.session_id],
        );
        await client.query(
            `INSERT INTO audit_logs (
                company_id, actor_user_id, event, entity_type, entity_id, context
             ) VALUES (
                $1, $2, 'auth.refresh_token_reuse_detected',
                'session', $3::UUID, jsonb_build_object('reusedSessionId', ($3::UUID)::TEXT)
             )`,
            [session.company_id, session.id, session.session_id],
        );
    }

    private async findSessionForUpdate(
        client: PoolClient,
        refreshTokenHash: string,
    ): Promise<SessionRow | null> {
        const result = await client.query<SessionRow>(
            `SELECT
                sessions.id AS session_id,
                sessions.expires_at AS session_expires_at,
                sessions.revoked_at AS session_revoked_at,
                sessions.revocation_reason AS session_revocation_reason,
                sessions.replaced_by_session_id AS session_replaced_by_session_id,
                users.id,
                users.password_hash,
                users.status,
                users.failed_login_attempts,
                users.locked_until,
                users.activated_at,
                users.email_verified_at,
                EXISTS (
                    SELECT 1 FROM user_roles
                    INNER JOIN roles ON roles.id = user_roles.role_id
                    WHERE user_roles.user_id = users.id
                      AND LOWER(roles.code) = 'administrator'
                ) AS is_administrator,
                employees.id AS employee_id,
                employees.company_id,
                employees.department_id,
                employees.position_id,
                employees.employee_code,
                employees.full_name,
                employees.email,
                employees.status AS employee_status,
                companies.active AS company_active
             FROM sessions
             INNER JOIN users ON users.id = sessions.user_id
             INNER JOIN employees ON employees.id = users.employee_id
             INNER JOIN companies ON companies.id = employees.company_id
             WHERE sessions.refresh_token_hash = $1
             FOR UPDATE OF sessions`,
            [refreshTokenHash],
        );

        return result.rows[0] ?? null;
    }
}

export const authRepository = new AuthRepository();
