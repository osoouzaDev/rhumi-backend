import assert from "node:assert/strict";
import argon2 from "argon2";
import app from "../dist/app.js";
import database, { closeDatabase } from "../dist/database/connection.js";
import { runWithTenantContext } from "../dist/database/tenant-context.js";
import migrationDatabase, {
    closeMigrationDatabase,
} from "../dist/database/migration-connection.js";

const server = app.listen(0);
const baseUrl = `http://127.0.0.1:${server.address().port}`;
const created = {
    companyId: undefined,
    departmentId: undefined,
    positionId: undefined,
    administratorEmployeeId: undefined,
    administratorUserId: undefined,
    collaboratorEmployeeId: undefined,
    collaboratorUserId: undefined,
};

const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: {
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
            ...options.headers,
        },
    });
    const payload = response.status === 204 ? undefined : await response.json();
    return { response, payload };
};

const requireSuccess = async (path, options = {}) => {
    const result = await request(path, options);
    if (!result.response.ok) {
        throw new Error(`${options.method ?? "GET"} ${path} retornou ${result.response.status}: ${result.payload?.error?.code}`);
    }
    return result;
};

const cleanup = async () => {
    if (!created.companyId) return;
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        const userIds = [created.administratorUserId, created.collaboratorUserId].filter(Boolean);
        await client.query("DELETE FROM notifications WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM notification_preferences WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM audit_logs WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM sessions WHERE user_id = ANY($1::UUID[])", [userIds]);
        await client.query("DELETE FROM user_permission_overrides WHERE user_id = ANY($1::UUID[])", [userIds]);
        await client.query("DELETE FROM user_roles WHERE user_id = ANY($1::UUID[])", [userIds]);
        await client.query("DELETE FROM users WHERE id = ANY($1::UUID[])", [userIds]);
        await client.query("DELETE FROM employees WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM positions WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM departments WHERE company_id = $1", [created.companyId]);
        await client.query("DELETE FROM companies WHERE id = $1", [created.companyId]);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

try {
    const databasePrivileges = await database.query(
        `SELECT
            CURRENT_USER <> pg_get_userbyid(databases.datdba) AS is_not_owner,
            NOT has_schema_privilege(CURRENT_USER, 'public', 'CREATE') AS cannot_create_schema_objects,
            NOT roles.rolsuper AND NOT roles.rolcreatedb AND NOT roles.rolcreaterole
                AND NOT roles.rolreplication AND NOT roles.rolbypassrls AS has_no_admin_attributes,
            NOT has_table_privilege(CURRENT_USER, 'public.audit_logs', 'UPDATE')
                AND NOT has_table_privilege(CURRENT_USER, 'public.audit_logs', 'DELETE')
                AS cannot_modify_audit_history,
            NOT has_table_privilege(CURRENT_USER, 'public.schema_migrations', 'INSERT')
                AND NOT has_table_privilege(CURRENT_USER, 'public.schema_migrations', 'UPDATE')
                AND NOT has_table_privilege(CURRENT_USER, 'public.schema_migrations', 'DELETE')
                AS cannot_modify_migration_history,
            NOT has_table_privilege(CURRENT_USER, 'public.usuarios', 'SELECT')
                AS cannot_read_legacy_users,
            (
                SELECT BOOL_AND(classes.relrowsecurity)
                FROM pg_class AS classes
                JOIN pg_namespace AS namespaces
                    ON namespaces.oid = classes.relnamespace
                WHERE namespaces.nspname = 'public'
                  AND classes.relname IN (
                      'companies', 'employees', 'users', 'sessions',
                      'audit_logs', 'trainings', 'evaluation_assignments'
                  )
            ) AS rls_enabled
         FROM pg_database AS databases
         JOIN pg_roles AS roles ON roles.rolname = CURRENT_USER
         WHERE databases.datname = CURRENT_DATABASE()`,
    );
    assert.deepEqual(databasePrivileges.rows[0], {
        is_not_owner: true,
        cannot_create_schema_objects: true,
        has_no_admin_attributes: true,
        cannot_modify_audit_history: true,
        cannot_modify_migration_history: true,
        cannot_read_legacy_users: true,
        rls_enabled: true,
    });

    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const administratorPassword = `Admin-${suffix}-Secure!`;
    const collaboratorPassword = `Collaborator-${suffix}-Secure!`;
    const [administratorHash, collaboratorHash] = await Promise.all([
        argon2.hash(administratorPassword, { type: argon2.argon2id }),
        argon2.hash(collaboratorPassword, { type: argon2.argon2id }),
    ]);
    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        const company = await client.query(
            `INSERT INTO companies (legal_name, trade_name, tax_id)
             VALUES ($1, $2, $3) RETURNING id`,
            [`Empresa de seguranÃƒÆ’Ã‚Â§a ${suffix}`, `Security ${suffix}`, `SEC-${suffix.slice(-16)}`],
        );
        created.companyId = company.rows[0].id;
        const department = await client.query(
            `INSERT INTO departments (company_id, name, acronym)
             VALUES ($1, $2, $3) RETURNING id`,
            [created.companyId, `SeguranÃƒÆ’Ã‚Â§a ${suffix}`, `S${suffix.slice(-5)}`],
        );
        created.departmentId = department.rows[0].id;
        const position = await client.query(
            `INSERT INTO positions (company_id, department_id, title)
             VALUES ($1, $2, $3) RETURNING id`,
            [created.companyId, created.departmentId, `Analista ${suffix}`],
        );
        created.positionId = position.rows[0].id;

        const createIdentity = async (kind, passwordHash) => {
            const employee = await client.query(
                `INSERT INTO employees (
                    company_id, department_id, position_id, employee_code,
                    full_name, email, contract_type, admission_date
                 ) VALUES ($1, $2, $3, $4, $5, $6, 'clt', CURRENT_DATE)
                 RETURNING id`,
                [
                    created.companyId, created.departmentId, created.positionId,
                    `${kind.toUpperCase()}-${suffix}`, `${kind} temporÃƒÆ’Ã‚Â¡rio ${suffix}`,
                    `${kind}.${suffix}@security.invalid`,
                ],
            );
            const user = await client.query(
                `INSERT INTO users (employee_id, password_hash)
                 VALUES ($1, $2) RETURNING id`,
                [employee.rows[0].id, passwordHash],
            );
            await client.query(
                `INSERT INTO user_roles (user_id, role_id)
                 SELECT $1, id FROM roles WHERE code = $2 AND company_id IS NULL`,
                [user.rows[0].id, kind],
            );
            return { employeeId: employee.rows[0].id, userId: user.rows[0].id };
        };

        const administrator = await createIdentity("administrator", administratorHash);
        created.administratorEmployeeId = administrator.employeeId;
        created.administratorUserId = administrator.userId;
        const collaborator = await createIdentity("collaborator", collaboratorHash);
        created.collaboratorEmployeeId = collaborator.employeeId;
        created.collaboratorUserId = collaborator.userId;
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    const rowsWithoutTenant = await database.query(
        "SELECT COUNT(*)::INTEGER AS total FROM employees",
    );
    assert.equal(rowsWithoutTenant.rows[0].total, 0);
    const rowsInsideTenant = await runWithTenantContext(
        created.companyId,
        () => database.query(
            "SELECT COUNT(*)::INTEGER AS total FROM employees",
        ),
    );
    assert.equal(rowsInsideTenant.rows[0].total, 2);

    const collaboratorLogin = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: `collaborator.${suffix}@security.invalid`,
            password: collaboratorPassword,
        }),
    });
    const collaboratorToken = collaboratorLogin.payload.data.accessToken;
    const ownProfile = await requireSuccess("/api/v1/employees/me", {
        token: collaboratorToken,
    });
    assert.equal(ownProfile.payload.data.employee.id, created.collaboratorEmployeeId);
    const forbiddenUsers = await request("/api/v1/users", { token: collaboratorToken });
    assert.equal(forbiddenUsers.response.status, 403);
    assert.equal(forbiddenUsers.payload.error.code, "INSUFFICIENT_PERMISSION");

    const seedLogin = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: process.env.SEED_ADMIN_EMAIL,
            password: process.env.SEED_ADMIN_PASSWORD,
        }),
    });
    const seedMe = await requireSuccess("/api/v1/auth/me", {
        token: seedLogin.payload.data.accessToken,
    });
    const foreignEmployeeId = seedMe.payload.data.user.employeeId;
    const foreignCompanyId = seedMe.payload.data.user.companyId;
    const hiddenForeignRow = await runWithTenantContext(
        created.companyId,
        () => database.query(
            "SELECT id FROM employees WHERE id = $1",
            [foreignEmployeeId],
        ),
    );
    assert.equal(hiddenForeignRow.rowCount, 0);
    await assert.rejects(
        runWithTenantContext(
            created.companyId,
            () => database.query(
                `INSERT INTO candidates (
                    company_id, full_name, email, source
                 ) VALUES ($1, 'RLS blocked', $2, 'security-test')`,
                [foreignCompanyId, `rls-blocked-${suffix}@security.invalid`],
            ),
        ),
        (error) => error?.code === "42501",
    );

    const tenantLogin = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: `administrator.${suffix}@security.invalid`,
            password: administratorPassword,
        }),
    });
    const tenantToken = tenantLogin.payload.data.accessToken;
    const crossTenantRead = await request(`/api/v1/employees/${foreignEmployeeId}`, {
        token: tenantToken,
    });
    assert.equal(crossTenantRead.response.status, 404);
    const crossTenantWrite = await request(`/api/v1/employees/${foreignEmployeeId}`, {
        method: "PATCH",
        token: tenantToken,
        body: JSON.stringify({ phone: null }),
    });
    assert.equal(crossTenantWrite.response.status, 404);

    const firstRefreshToken = tenantLogin.payload.data.refreshToken;
    const rotated = await requireSuccess("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: firstRefreshToken }),
    });
    const reused = await request("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: firstRefreshToken }),
    });
    assert.equal(reused.response.status, 401);
    assert.equal(reused.payload.error.code, "INVALID_REFRESH_TOKEN");
    const revokedSuccessor = await request("/api/v1/auth/me", {
        token: rotated.payload.data.accessToken,
    });
    assert.equal(revokedSuccessor.response.status, 401);
    assert.equal(revokedSuccessor.payload.error.code, "INVALID_SESSION");

    const sessionA = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: `administrator.${suffix}@security.invalid`,
            password: administratorPassword,
        }),
    });
    const sessionB = await requireSuccess("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({
            identifier: `administrator.${suffix}@security.invalid`,
            password: administratorPassword,
        }),
    });
    await requireSuccess("/api/v1/auth/logout-all", {
        method: "POST",
        token: sessionA.payload.data.accessToken,
    });
    const revokedByLogoutAll = await request("/api/v1/auth/me", {
        token: sessionB.payload.data.accessToken,
    });
    assert.equal(revokedByLogoutAll.response.status, 401);
    assert.equal(revokedByLogoutAll.payload.error.code, "INVALID_SESSION");

    console.log("Controles de sessÃƒÆ’Ã‚Â£o, RBAC e isolamento entre empresas validados com sucesso.");
} finally {
    try {
        await cleanup();
    } finally {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
            server.closeAllConnections();
        });
        await Promise.all([closeDatabase(), closeMigrationDatabase()]);
    }
}
