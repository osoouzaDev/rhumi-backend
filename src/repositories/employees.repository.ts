import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    CreateEmployeeInput,
    EmployeeListQuery,
    UpdateEmployeeInput,
} from "../schemas/employees.schemas.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface Employee {
    id: string;
    companyId: string;
    departmentId: string;
    departmentName: string;
    positionId: string;
    positionTitle: string;
    employeeCode: string;
    fullName: string;
    email: string;
    phone: string | null;
    contractType: "clt" | "pj";
    status: "active" | "on_leave" | "inactive";
    admissionDate: string;
    terminationDate: string | null;
    hasAccount: boolean;
    accountStatus: "active" | "blocked" | "inactive" | null;
    createdAt: Date;
    updatedAt: Date;
}

interface EmployeeRow {
    id: string;
    company_id: string;
    department_id: string;
    department_name: string;
    position_id: string;
    position_title: string;
    employee_code: string;
    full_name: string;
    email: string;
    phone: string | null;
    contract_type: Employee["contractType"];
    status: Employee["status"];
    admission_date: string;
    termination_date: string | null;
    user_id: string | null;
    account_status: Employee["accountStatus"];
    created_at: Date;
    updated_at: Date;
    total?: number;
}

const employeeSelect = `
    SELECT employees.id, employees.company_id, employees.department_id,
           departments.name AS department_name, employees.position_id,
           positions.title AS position_title, employees.employee_code,
           employees.full_name, employees.email, employees.phone,
           employees.contract_type, employees.status, employees.admission_date,
           employees.termination_date, users.id AS user_id,
           users.status AS account_status, employees.created_at, employees.updated_at
    FROM employees
    INNER JOIN departments ON departments.id = employees.department_id
    INNER JOIN positions ON positions.id = employees.position_id
    LEFT JOIN users ON users.employee_id = employees.id AND users.deleted_at IS NULL
`;

const mapEmployee = (row: EmployeeRow): Employee => ({
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    positionId: row.position_id,
    positionTitle: row.position_title,
    employeeCode: row.employee_code,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    contractType: row.contract_type,
    status: row.status,
    admissionDate: row.admission_date,
    terminationDate: row.termination_date,
    hasAccount: row.user_id !== null,
    accountStatus: row.account_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    employeeId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'employee', $4, $5, $6::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            employeeId,
            actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const buildAssignments = (input: UpdateEmployeeInput, values: unknown[]): string[] => {
    const columns: Record<keyof UpdateEmployeeInput, string> = {
        departmentId: "department_id",
        positionId: "position_id",
        employeeCode: "employee_code",
        fullName: "full_name",
        email: "email",
        phone: "phone",
        contractType: "contract_type",
        status: "status",
        admissionDate: "admission_date",
        terminationDate: "termination_date",
    };

    return Object.entries(input)
        .filter(([, value]) => value !== undefined)
        .map(([field, value]) => {
            values.push(value);
            return `${columns[field as keyof UpdateEmployeeInput]} = $${values.length}`;
        });
};

export class EmployeesRepository {
    async list(
        companyId: string,
        query: EmployeeListQuery,
        scopeDepartmentId?: string,
    ): Promise<PaginatedResult<Employee>> {
        const values: unknown[] = [companyId];
        const conditions = ["employees.company_id = $1", "employees.deleted_at IS NULL"];

        if (scopeDepartmentId) {
            values.push(scopeDepartmentId);
            conditions.push(`employees.department_id = $${values.length}`);
        }
        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(
                employees.full_name ILIKE $${values.length}
                OR employees.email ILIKE $${values.length}
                OR employees.employee_code ILIKE $${values.length}
            )`);
        }
        if (query.departmentId) {
            values.push(query.departmentId);
            conditions.push(`employees.department_id = $${values.length}`);
        }
        if (query.positionId) {
            values.push(query.positionId);
            conditions.push(`employees.position_id = $${values.length}`);
        }
        if (query.status) {
            values.push(query.status);
            conditions.push(`employees.status = $${values.length}`);
        }
        if (query.contractType) {
            values.push(query.contractType);
            conditions.push(`employees.contract_type = $${values.length}`);
        }

        const sortColumns: Record<EmployeeListQuery["sortBy"], string> = {
            fullName: "employees.full_name",
            admissionDate: "employees.admission_date",
            createdAt: "employees.created_at",
        };
        const sortDirection = query.sortOrder === "desc" ? "DESC" : "ASC";
        values.push(query.pageSize, (query.page - 1) * query.pageSize);

        const result = await database.query<EmployeeRow>(
            `SELECT employees.id, employees.company_id, employees.department_id,
                    departments.name AS department_name, employees.position_id,
                    positions.title AS position_title, employees.employee_code,
                    employees.full_name, employees.email, employees.phone,
                    employees.contract_type, employees.status, employees.admission_date,
                    employees.termination_date, users.id AS user_id,
                    users.status AS account_status, employees.created_at, employees.updated_at,
                    COUNT(*) OVER()::INTEGER AS total
             FROM employees
             INNER JOIN departments ON departments.id = employees.department_id
             INNER JOIN positions ON positions.id = employees.position_id
             LEFT JOIN users ON users.employee_id = employees.id AND users.deleted_at IS NULL
             WHERE ${conditions.join(" AND ")}
             ORDER BY ${sortColumns[query.sortBy]} ${sortDirection}, employees.id ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );

        return {
            items: result.rows.map(mapEmployee),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findById(
        companyId: string,
        employeeId: string,
        scopeDepartmentId?: string,
    ): Promise<Employee | null> {
        const values: unknown[] = [employeeId, companyId];
        const conditions = [
            "employees.id = $1",
            "employees.company_id = $2",
            "employees.deleted_at IS NULL",
        ];

        if (scopeDepartmentId) {
            values.push(scopeDepartmentId);
            conditions.push(`employees.department_id = $${values.length}`);
        }

        const result = await database.query<EmployeeRow>(
            `${employeeSelect}
             WHERE ${conditions.join(" AND ")}
             LIMIT 1`,
            values,
        );

        return result.rows[0] ? mapEmployee(result.rows[0]) : null;
    }

    async create(
        companyId: string,
        input: CreateEmployeeInput,
        actor: AuditActor,
    ): Promise<Employee> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO employees (
                    company_id, department_id, position_id, employee_code, full_name,
                    email, phone, contract_type, status, admission_date, termination_date
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING id`,
                [
                    companyId,
                    input.departmentId,
                    input.positionId,
                    input.employeeCode,
                    input.fullName,
                    input.email,
                    input.phone ?? null,
                    input.contractType,
                    input.status,
                    input.admissionDate,
                    input.terminationDate ?? null,
                ],
            );
            const employeeId = result.rows[0].id;
            await addAuditLog(client, companyId, actor, "employee.created", employeeId);
            const employeeResult = await client.query<EmployeeRow>(
                `${employeeSelect} WHERE employees.id = $1`,
                [employeeId],
            );
            await client.query("COMMIT");
            return mapEmployee(employeeResult.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        companyId: string,
        employeeId: string,
        input: UpdateEmployeeInput,
        actor: AuditActor,
        scopeDepartmentId?: string,
    ): Promise<Employee | null> {
        const values: unknown[] = [];
        const assignments = buildAssignments(input, values);
        values.push(employeeId, companyId);
        const conditions = [
            `id = $${values.length - 1}`,
            `company_id = $${values.length}`,
            "deleted_at IS NULL",
        ];

        if (scopeDepartmentId) {
            values.push(scopeDepartmentId);
            conditions.push(`department_id = $${values.length}`);
        }

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE employees
                 SET ${assignments.join(", ")}
                 WHERE ${conditions.join(" AND ")}
                 RETURNING id`,
                values,
            );
            const row = result.rows[0];

            if (!row) {
                await client.query("COMMIT");
                return null;
            }

            if (input.status === "inactive") {
                await client.query(
                    `UPDATE users SET status = 'inactive' WHERE employee_id = $1 AND deleted_at IS NULL`,
                    [employeeId],
                );
                await client.query(
                    `UPDATE sessions
                     SET revoked_at = COALESCE(revoked_at, NOW()),
                         revocation_reason = COALESCE(revocation_reason, 'employee_inactivated')
                     WHERE user_id IN (SELECT id FROM users WHERE employee_id = $1)
                       AND revoked_at IS NULL`,
                    [employeeId],
                );
            }

            await addAuditLog(
                client,
                companyId,
                actor,
                "employee.updated",
                employeeId,
                Object.keys(input),
            );
            const employeeResult = await client.query<EmployeeRow>(
                `${employeeSelect} WHERE employees.id = $1`,
                [employeeId],
            );
            await client.query("COMMIT");
            return mapEmployee(employeeResult.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async archive(
        companyId: string,
        employeeId: string,
        actor: AuditActor,
        scopeDepartmentId?: string,
    ): Promise<boolean> {
        const values: unknown[] = [employeeId, companyId];
        const conditions = ["id = $1", "company_id = $2", "deleted_at IS NULL"];
        if (scopeDepartmentId) {
            values.push(scopeDepartmentId);
            conditions.push(`department_id = $${values.length}`);
        }

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE employees
                 SET status = 'inactive', deleted_at = NOW()
                 WHERE ${conditions.join(" AND ")}
                 RETURNING id`,
                values,
            );
            if (!result.rows[0]) {
                await client.query("COMMIT");
                return false;
            }

            await client.query(
                `UPDATE users
                 SET status = 'inactive', deleted_at = NOW()
                 WHERE employee_id = $1 AND deleted_at IS NULL`,
                [employeeId],
            );
            await client.query(
                `UPDATE sessions
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revocation_reason = COALESCE(revocation_reason, 'employee_archived')
                 WHERE user_id IN (SELECT id FROM users WHERE employee_id = $1)
                   AND revoked_at IS NULL`,
                [employeeId],
            );
            await addAuditLog(client, companyId, actor, "employee.archived", employeeId);
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

export const employeesRepository = new EmployeesRepository();
