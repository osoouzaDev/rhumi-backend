import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { UserListQuery } from "../schemas/users.schemas.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface PermissionOverride {
    permissionCode: string;
    effect: "allow" | "deny";
}

export interface UserAccount {
    id: string;
    employeeId: string;
    companyId: string;
    employeeCode: string;
    fullName: string;
    email: string;
    employeeStatus: "active" | "on_leave" | "inactive";
    departmentId: string;
    departmentName: string;
    positionId: string;
    positionTitle: string;
    status: "active" | "blocked" | "inactive";
    roles: string[];
    permissionOverrides: PermissionOverride[];
    effectivePermissions: string[];
    failedLoginAttempts: number;
    lockedUntil: Date | null;
    lastLoginAt: Date | null;
    passwordChangedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface EmployeeAccountCandidate {
    employeeId: string;
    employeeStatus: UserAccount["employeeStatus"];
    accountId: string | null;
    accountDeletedAt: Date | null;
}

export interface RoleDefinition {
    id: string;
    code: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    permissionCodes: string[];
}

export interface PermissionDefinition {
    id: string;
    code: string;
    module: string;
    action: string;
    description: string | null;
}

export interface ResolvedPermissionOverride {
    permissionId: string;
    effect: "allow" | "deny";
}

export interface SaveUserAccessInput {
    employeeId?: string;
    passwordHash?: string;
    status?: UserAccount["status"];
    roleIds?: string[];
    permissionOverrides?: ResolvedPermissionOverride[];
}

interface UserAccountRow {
    id: string;
    employee_id: string;
    company_id: string;
    employee_code: string;
    full_name: string;
    email: string;
    employee_status: UserAccount["employeeStatus"];
    department_id: string;
    department_name: string;
    position_id: string;
    position_title: string;
    status: UserAccount["status"];
    roles: string[];
    permission_overrides: PermissionOverride[];
    effective_permissions: string[];
    failed_login_attempts: number;
    locked_until: Date | null;
    last_login_at: Date | null;
    password_changed_at: Date;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

interface RoleDefinitionRow {
    id: string;
    code: string;
    name: string;
    description: string | null;
    is_system: boolean;
    permission_codes: string[];
}

const userAccountColumns = `
    users.id, employees.id AS employee_id, employees.company_id,
    employees.employee_code, employees.full_name, employees.email,
    employees.status AS employee_status, employees.department_id,
    departments.name AS department_name, employees.position_id,
    positions.title AS position_title, users.status,
    ARRAY(
        SELECT DISTINCT roles.code
        FROM user_roles
        INNER JOIN roles ON roles.id = user_roles.role_id
        WHERE user_roles.user_id = users.id
        ORDER BY roles.code
    ) AS roles,
    COALESCE((
        SELECT JSONB_AGG(
            JSONB_BUILD_OBJECT(
                'permissionCode', permissions.code,
                'effect', user_permission_overrides.effect
            ) ORDER BY permissions.code
        )
        FROM user_permission_overrides
        INNER JOIN permissions
            ON permissions.id = user_permission_overrides.permission_id
        WHERE user_permission_overrides.user_id = users.id
    ), '[]'::JSONB) AS permission_overrides,
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
    ) AS effective_permissions,
    users.failed_login_attempts, users.locked_until, users.last_login_at,
    users.password_changed_at, users.created_at, users.updated_at
`;

const userAccountFrom = `
    FROM users
    INNER JOIN employees ON employees.id = users.employee_id
    INNER JOIN departments ON departments.id = employees.department_id
    INNER JOIN positions ON positions.id = employees.position_id
`;

const mapUserAccount = (row: UserAccountRow): UserAccount => ({
    id: row.id,
    employeeId: row.employee_id,
    companyId: row.company_id,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    employeeStatus: row.employee_status,
    departmentId: row.department_id,
    departmentName: row.department_name,
    positionId: row.position_id,
    positionTitle: row.position_title,
    status: row.status,
    roles: row.roles,
    permissionOverrides: row.permission_overrides,
    effectivePermissions: row.effective_permissions,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    lastLoginAt: row.last_login_at,
    passwordChangedAt: row.password_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const selectUserById = async (
    client: PoolClient,
    userId: string,
): Promise<UserAccount> => {
    const result = await client.query<UserAccountRow>(
        `SELECT ${userAccountColumns} ${userAccountFrom}
         WHERE users.id = $1`,
        [userId],
    );
    return mapUserAccount(result.rows[0]);
};

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    userId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'user', $4, $5, $6::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            userId,
            actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const synchronizeRoles = async (
    client: PoolClient,
    userId: string,
    roleIds: string[],
    actorUserId: string,
): Promise<void> => {
    await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
    await client.query(
        `INSERT INTO user_roles (user_id, role_id, assigned_by)
         SELECT $1, assigned_role.role_id, $3
         FROM UNNEST($2::UUID[]) AS assigned_role(role_id)`,
        [userId, roleIds, actorUserId],
    );
};

const synchronizePermissionOverrides = async (
    client: PoolClient,
    userId: string,
    overrides: ResolvedPermissionOverride[],
    actorUserId: string,
): Promise<void> => {
    await client.query("DELETE FROM user_permission_overrides WHERE user_id = $1", [userId]);
    if (overrides.length === 0) {
        return;
    }
    await client.query(
        `INSERT INTO user_permission_overrides (
            user_id, permission_id, effect, assigned_by
         )
         SELECT $1, item.permission_id, item.effect::permission_effect, $4
         FROM UNNEST($2::UUID[], $3::TEXT[]) AS item(permission_id, effect)`,
        [
            userId,
            overrides.map((override) => override.permissionId),
            overrides.map((override) => override.effect),
            actorUserId,
        ],
    );
};

export class UsersRepository {
    async list(companyId: string, query: UserListQuery): Promise<PaginatedResult<UserAccount>> {
        const values: unknown[] = [companyId];
        const conditions = [
            "employees.company_id = $1",
            "employees.deleted_at IS NULL",
            "users.deleted_at IS NULL",
        ];

        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(
                employees.full_name ILIKE $${values.length}
                OR employees.email ILIKE $${values.length}
                OR employees.employee_code ILIKE $${values.length}
            )`);
        }
        if (query.status) {
            values.push(query.status);
            conditions.push(`users.status = $${values.length}`);
        }
        if (query.roleCode) {
            values.push(query.roleCode);
            conditions.push(`EXISTS (
                SELECT 1
                FROM user_roles AS filtered_user_roles
                INNER JOIN roles AS filtered_roles
                    ON filtered_roles.id = filtered_user_roles.role_id
                WHERE filtered_user_roles.user_id = users.id
                  AND LOWER(filtered_roles.code) = LOWER($${values.length})
            )`);
        }

        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<UserAccountRow>(
            `SELECT ${userAccountColumns}, COUNT(*) OVER()::INTEGER AS total
             ${userAccountFrom}
             WHERE ${conditions.join(" AND ")}
             ORDER BY employees.full_name ASC, users.id ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapUserAccount),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findById(companyId: string, userId: string): Promise<UserAccount | null> {
        const result = await database.query<UserAccountRow>(
            `SELECT ${userAccountColumns} ${userAccountFrom}
             WHERE users.id = $1
               AND employees.company_id = $2
               AND users.deleted_at IS NULL
               AND employees.deleted_at IS NULL
             LIMIT 1`,
            [userId, companyId],
        );
        return result.rows[0] ? mapUserAccount(result.rows[0]) : null;
    }

    async findEmployeeCandidate(
        companyId: string,
        employeeId: string,
    ): Promise<EmployeeAccountCandidate | null> {
        const result = await database.query<{
            employee_id: string;
            employee_status: UserAccount["employeeStatus"];
            account_id: string | null;
            account_deleted_at: Date | null;
        }>(
            `SELECT employees.id AS employee_id, employees.status AS employee_status,
                    users.id AS account_id, users.deleted_at AS account_deleted_at
             FROM employees
             LEFT JOIN users ON users.employee_id = employees.id
             WHERE employees.id = $1
               AND employees.company_id = $2
               AND employees.deleted_at IS NULL
             LIMIT 1`,
            [employeeId, companyId],
        );
        const row = result.rows[0];
        return row ? {
            employeeId: row.employee_id,
            employeeStatus: row.employee_status,
            accountId: row.account_id,
            accountDeletedAt: row.account_deleted_at,
        } : null;
    }

    async findRolesByCodes(companyId: string, codes: string[]): Promise<RoleDefinition[]> {
        const result = await database.query<RoleDefinitionRow>(
            `SELECT DISTINCT ON (LOWER(roles.code))
                    roles.id, roles.code, roles.name, roles.description, roles.is_system,
                    ARRAY(
                        SELECT permissions.code
                        FROM role_permissions
                        INNER JOIN permissions ON permissions.id = role_permissions.permission_id
                        WHERE role_permissions.role_id = roles.id
                        ORDER BY permissions.code
                    ) AS permission_codes
             FROM roles
             WHERE (roles.company_id IS NULL OR roles.company_id = $1)
               AND LOWER(roles.code) = ANY($2::TEXT[])
             ORDER BY LOWER(roles.code), roles.company_id NULLS LAST`,
            [companyId, codes],
        );
        return result.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            description: row.description,
            isSystem: row.is_system,
            permissionCodes: row.permission_codes,
        }));
    }

    async listRoles(companyId: string): Promise<RoleDefinition[]> {
        const result = await database.query<RoleDefinitionRow>(
            `SELECT roles.id, roles.code, roles.name, roles.description, roles.is_system,
                    ARRAY(
                        SELECT permissions.code
                        FROM role_permissions
                        INNER JOIN permissions ON permissions.id = role_permissions.permission_id
                        WHERE role_permissions.role_id = roles.id
                        ORDER BY permissions.code
                    ) AS permission_codes
             FROM roles
             WHERE roles.company_id IS NULL OR roles.company_id = $1
             ORDER BY roles.is_system DESC, roles.name ASC`,
            [companyId],
        );
        return result.rows.map((row) => ({
            id: row.id,
            code: row.code,
            name: row.name,
            description: row.description,
            isSystem: row.is_system,
            permissionCodes: row.permission_codes,
        }));
    }

    async findPermissionsByCodes(codes: string[]): Promise<PermissionDefinition[]> {
        if (codes.length === 0) {
            return [];
        }
        const result = await database.query<PermissionDefinition>(
            `SELECT id, code, module, action, description
             FROM permissions
             WHERE LOWER(code) = ANY($1::TEXT[])
             ORDER BY code`,
            [codes],
        );
        return result.rows;
    }

    async listPermissions(): Promise<PermissionDefinition[]> {
        const result = await database.query<PermissionDefinition>(
            `SELECT id, code, module, action, description
             FROM permissions
             ORDER BY module, action, code`,
        );
        return result.rows;
    }

    async countActiveAdministrators(companyId: string): Promise<number> {
        const result = await database.query<{ total: number }>(
            `SELECT COUNT(DISTINCT users.id)::INTEGER AS total
             FROM users
             INNER JOIN employees ON employees.id = users.employee_id
             INNER JOIN user_roles ON user_roles.user_id = users.id
             INNER JOIN roles ON roles.id = user_roles.role_id
             WHERE employees.company_id = $1
               AND employees.deleted_at IS NULL
               AND employees.status = 'active'
               AND users.deleted_at IS NULL
               AND users.status = 'active'
               AND LOWER(roles.code) = 'administrator'`,
            [companyId],
        );
        return result.rows[0].total;
    }

    async createOrRestore(
        companyId: string,
        input: Required<Pick<
            SaveUserAccessInput,
            "employeeId" | "passwordHash" | "roleIds" | "permissionOverrides"
        >>,
        actor: AuditActor,
    ): Promise<UserAccount> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO users (employee_id, password_hash)
                 VALUES ($1, $2)
                 ON CONFLICT (employee_id) DO UPDATE
                 SET password_hash = EXCLUDED.password_hash,
                     status = 'active', failed_login_attempts = 0, locked_until = NULL,
                     password_changed_at = NOW(), deleted_at = NULL
                 RETURNING id`,
                [input.employeeId, input.passwordHash],
            );
            const userId = result.rows[0].id;
            await client.query(
                `UPDATE sessions
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revocation_reason = COALESCE(revocation_reason, 'user_restored')
                 WHERE user_id = $1 AND revoked_at IS NULL`,
                [userId],
            );
            await synchronizeRoles(client, userId, input.roleIds, actor.userId);
            await synchronizePermissionOverrides(
                client,
                userId,
                input.permissionOverrides,
                actor.userId,
            );
            await addAuditLog(client, companyId, actor, "user.created_or_restored", userId);
            const account = await selectUserById(client, userId);
            await client.query("COMMIT");
            return account;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        companyId: string,
        userId: string,
        input: SaveUserAccessInput,
        actor: AuditActor,
    ): Promise<UserAccount | null> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const assignments: string[] = [];
            const values: unknown[] = [];

            if (input.status !== undefined) {
                values.push(input.status);
                assignments.push(`status = $${values.length}`);
            }
            if (input.passwordHash !== undefined) {
                values.push(input.passwordHash);
                assignments.push(
                    `password_hash = $${values.length}`,
                    "password_changed_at = NOW()",
                    "failed_login_attempts = 0",
                    "locked_until = NULL",
                );
            }
            if (input.status === "active") {
                assignments.push("failed_login_attempts = 0", "locked_until = NULL");
            }

            let exists: boolean;
            if (assignments.length > 0) {
                values.push(userId, companyId);
                const result = await client.query<{ id: string }>(
                    `UPDATE users
                     SET ${[...new Set(assignments)].join(", ")}
                     WHERE id = $${values.length - 1}
                       AND deleted_at IS NULL
                       AND employee_id IN (
                           SELECT id FROM employees
                           WHERE company_id = $${values.length} AND deleted_at IS NULL
                       )
                     RETURNING id`,
                    values,
                );
                exists = Boolean(result.rows[0]);
            } else {
                const result = await client.query<{ exists: boolean }>(
                    `SELECT EXISTS (
                        SELECT 1 FROM users
                        INNER JOIN employees ON employees.id = users.employee_id
                        WHERE users.id = $1 AND employees.company_id = $2
                          AND users.deleted_at IS NULL AND employees.deleted_at IS NULL
                    ) AS exists`,
                    [userId, companyId],
                );
                exists = result.rows[0].exists;
            }

            if (!exists) {
                await client.query("COMMIT");
                return null;
            }
            if (input.roleIds !== undefined) {
                await synchronizeRoles(client, userId, input.roleIds, actor.userId);
            }
            if (input.permissionOverrides !== undefined) {
                await synchronizePermissionOverrides(
                    client,
                    userId,
                    input.permissionOverrides,
                    actor.userId,
                );
            }
            await client.query(
                `UPDATE sessions
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revocation_reason = COALESCE(revocation_reason, 'access_updated')
                 WHERE user_id = $1 AND revoked_at IS NULL`,
                [userId],
            );
            await addAuditLog(
                client,
                companyId,
                actor,
                "user.access_updated",
                userId,
                Object.keys(input).filter(
                    (field) => input[field as keyof SaveUserAccessInput] !== undefined,
                ),
            );
            const account = await selectUserById(client, userId);
            await client.query("COMMIT");
            return account;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async archive(companyId: string, userId: string, actor: AuditActor): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE users
                 SET status = 'inactive', deleted_at = NOW()
                 WHERE id = $1 AND deleted_at IS NULL
                   AND employee_id IN (
                       SELECT id FROM employees
                       WHERE company_id = $2 AND deleted_at IS NULL
                   )
                 RETURNING id`,
                [userId, companyId],
            );
            if (!result.rows[0]) {
                await client.query("COMMIT");
                return false;
            }
            await client.query(
                `UPDATE sessions
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revocation_reason = COALESCE(revocation_reason, 'user_archived')
                 WHERE user_id = $1 AND revoked_at IS NULL`,
                [userId],
            );
            await addAuditLog(client, companyId, actor, "user.archived", userId);
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}

export const usersRepository = new UsersRepository();
