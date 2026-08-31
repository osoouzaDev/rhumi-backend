import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    CreateDepartmentInput,
    CreatePositionInput,
    DepartmentListQuery,
    PositionListQuery,
    UpdateCompanyInput,
    UpdateDepartmentInput,
    UpdatePositionInput,
} from "../schemas/organization.schemas.js";

export interface AuditActor {
    userId: string;
    requestId?: string;
}

export interface PaginatedResult<T> {
    items: T[];
    total: number;
}

export interface Company {
    id: string;
    legalName: string;
    tradeName: string | null;
    taxId: string;
    email: string | null;
    phone: string | null;
    addressLine: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    foundedOn: string | null;
    description: string | null;
    careersHeadline: string | null;
    careersDescription: string | null;
    careersSlug: string | null;
    mission: string | null;
    vision: string | null;
    valuesText: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Department {
    id: string;
    companyId: string;
    name: string;
    acronym: string | null;
    icon: string | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Position {
    id: string;
    companyId: string;
    departmentId: string;
    departmentName: string;
    title: string;
    description: string | null;
    baseSalary: number | null;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

interface CompanyRow {
    id: string;
    legal_name: string;
    trade_name: string | null;
    tax_id: string;
    email: string | null;
    phone: string | null;
    address_line: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    founded_on: string | null;
    description: string | null;
    careers_headline: string | null;
    careers_description: string | null;
    careers_slug: string | null;
    mission: string | null;
    vision: string | null;
    values_text: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
}

interface DepartmentRow {
    id: string;
    company_id: string;
    name: string;
    acronym: string | null;
    icon: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

interface PositionRow {
    id: string;
    company_id: string;
    department_id: string;
    department_name: string;
    title: string;
    description: string | null;
    base_salary: string | null;
    active: boolean;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

const companyColumns = `
    id, legal_name, trade_name, tax_id, email, phone, address_line, city, state,
    postal_code, founded_on, description, careers_headline, careers_description,
    careers_slug, mission, vision, values_text, active, created_at, updated_at
`;

const mapCompany = (row: CompanyRow): Company => ({
    id: row.id,
    legalName: row.legal_name,
    tradeName: row.trade_name,
    taxId: row.tax_id,
    email: row.email,
    phone: row.phone,
    addressLine: row.address_line,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    foundedOn: row.founded_on,
    description: row.description,
    careersHeadline: row.careers_headline,
    careersDescription: row.careers_description,
    careersSlug: row.careers_slug,
    mission: row.mission,
    vision: row.vision,
    valuesText: row.values_text,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapDepartment = (row: DepartmentRow): Department => ({
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    acronym: row.acronym,
    icon: row.icon,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapPosition = (row: PositionRow): Position => ({
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    title: row.title,
    description: row.description,
    baseSalary: row.base_salary === null ? null : Number(row.base_salary),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    entityType: string,
    entityId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            entityType,
            entityId,
            actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const buildAssignments = (
    input: object,
    columns: Record<string, string>,
    values: unknown[],
): string[] => Object.entries(input)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => {
        values.push(value);
        return `${columns[field]} = $${values.length}`;
    });

export class OrganizationRepository {
    async findCompany(companyId: string): Promise<Company | null> {
        const result = await database.query<CompanyRow>(
            `SELECT ${companyColumns}
             FROM companies
             WHERE id = $1 AND deleted_at IS NULL
             LIMIT 1`,
            [companyId],
        );

        return result.rows[0] ? mapCompany(result.rows[0]) : null;
    }

    async updateCompany(
        companyId: string,
        input: UpdateCompanyInput,
        actor: AuditActor,
    ): Promise<Company | null> {
        const values: unknown[] = [];
        const assignments = buildAssignments(input, {
            legalName: "legal_name",
            tradeName: "trade_name",
            taxId: "tax_id",
            email: "email",
            phone: "phone",
            addressLine: "address_line",
            city: "city",
            state: "state",
            postalCode: "postal_code",
            foundedOn: "founded_on",
            description: "description",
            careersHeadline: "careers_headline",
            careersDescription: "careers_description",
            careersSlug: "careers_slug",
            mission: "mission",
            vision: "vision",
            valuesText: "values_text",
            active: "active",
        }, values);
        values.push(companyId);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<CompanyRow>(
                `UPDATE companies
                 SET ${assignments.join(", ")}
                 WHERE id = $${values.length} AND deleted_at IS NULL
                 RETURNING ${companyColumns}`,
                values,
            );
            const row = result.rows[0];

            if (row) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "company.updated",
                    "company",
                    companyId,
                    Object.keys(input),
                );
            }

            await client.query("COMMIT");
            return row ? mapCompany(row) : null;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listDepartments(
        companyId: string,
        query: DepartmentListQuery,
    ): Promise<PaginatedResult<Department>> {
        const values: unknown[] = [companyId];
        const conditions = ["company_id = $1", "deleted_at IS NULL"];

        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(name ILIKE $${values.length} OR acronym ILIKE $${values.length})`);
        }
        if (query.active !== undefined) {
            values.push(query.active);
            conditions.push(`active = $${values.length}`);
        }

        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<DepartmentRow>(
            `SELECT id, company_id, name, acronym, icon, active, created_at, updated_at,
                    COUNT(*) OVER()::INTEGER AS total
             FROM departments
             WHERE ${conditions.join(" AND ")}
             ORDER BY name ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );

        return {
            items: result.rows.map(mapDepartment),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findDepartment(companyId: string, departmentId: string): Promise<Department | null> {
        const result = await database.query<DepartmentRow>(
            `SELECT id, company_id, name, acronym, icon, active, created_at, updated_at
             FROM departments
             WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [departmentId, companyId],
        );

        return result.rows[0] ? mapDepartment(result.rows[0]) : null;
    }

    async createDepartment(
        companyId: string,
        input: CreateDepartmentInput,
        actor: AuditActor,
    ): Promise<Department> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<DepartmentRow>(
                `INSERT INTO departments (company_id, name, acronym, icon, active)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, company_id, name, acronym, icon, active, created_at, updated_at`,
                [companyId, input.name, input.acronym ?? null, input.icon ?? null, input.active],
            );
            const row = result.rows[0];
            await addAuditLog(
                client,
                companyId,
                actor,
                "department.created",
                "department",
                row.id,
            );
            await client.query("COMMIT");
            return mapDepartment(row);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateDepartment(
        companyId: string,
        departmentId: string,
        input: UpdateDepartmentInput,
        actor: AuditActor,
    ): Promise<Department | null> {
        const values: unknown[] = [];
        const assignments = buildAssignments(input, {
            name: "name",
            acronym: "acronym",
            icon: "icon",
            active: "active",
        }, values);
        values.push(departmentId, companyId);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<DepartmentRow>(
                `UPDATE departments
                 SET ${assignments.join(", ")}
                 WHERE id = $${values.length - 1}
                   AND company_id = $${values.length}
                   AND deleted_at IS NULL
                 RETURNING id, company_id, name, acronym, icon, active, created_at, updated_at`,
                values,
            );
            const row = result.rows[0];

            if (row) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "department.updated",
                    "department",
                    departmentId,
                    Object.keys(input),
                );
            }

            await client.query("COMMIT");
            return row ? mapDepartment(row) : null;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getDepartmentUsage(
        companyId: string,
        departmentId: string,
    ): Promise<{ positions: number; employees: number }> {
        const result = await database.query<{ positions: number; employees: number }>(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM positions
                 WHERE company_id = $1 AND department_id = $2 AND deleted_at IS NULL) AS positions,
                (SELECT COUNT(*)::INTEGER FROM employees
                 WHERE company_id = $1 AND department_id = $2 AND deleted_at IS NULL) AS employees`,
            [companyId, departmentId],
        );

        return result.rows[0];
    }

    async archiveDepartment(
        companyId: string,
        departmentId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE departments
                 SET active = FALSE, deleted_at = NOW()
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 RETURNING id`,
                [departmentId, companyId],
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "department.archived",
                    "department",
                    departmentId,
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

    async listPositions(
        companyId: string,
        query: PositionListQuery,
    ): Promise<PaginatedResult<Position>> {
        const values: unknown[] = [companyId];
        const conditions = ["positions.company_id = $1", "positions.deleted_at IS NULL"];

        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`positions.title ILIKE $${values.length}`);
        }
        if (query.departmentId) {
            values.push(query.departmentId);
            conditions.push(`positions.department_id = $${values.length}`);
        }
        if (query.active !== undefined) {
            values.push(query.active);
            conditions.push(`positions.active = $${values.length}`);
        }

        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<PositionRow>(
            `SELECT positions.id, positions.company_id, positions.department_id,
                    departments.name AS department_name, positions.title,
                    positions.description, positions.base_salary, positions.active,
                    positions.created_at, positions.updated_at,
                    COUNT(*) OVER()::INTEGER AS total
             FROM positions
             INNER JOIN departments ON departments.id = positions.department_id
             WHERE ${conditions.join(" AND ")}
             ORDER BY departments.name ASC, positions.title ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );

        return {
            items: result.rows.map(mapPosition),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findPosition(companyId: string, positionId: string): Promise<Position | null> {
        const result = await database.query<PositionRow>(
            `SELECT positions.id, positions.company_id, positions.department_id,
                    departments.name AS department_name, positions.title,
                    positions.description, positions.base_salary, positions.active,
                    positions.created_at, positions.updated_at
             FROM positions
             INNER JOIN departments ON departments.id = positions.department_id
             WHERE positions.id = $1
               AND positions.company_id = $2
               AND positions.deleted_at IS NULL
             LIMIT 1`,
            [positionId, companyId],
        );

        return result.rows[0] ? mapPosition(result.rows[0]) : null;
    }

    async createPosition(
        companyId: string,
        input: CreatePositionInput,
        actor: AuditActor,
    ): Promise<Position> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO positions (
                    company_id, department_id, title, description, base_salary, active
                 ) VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id`,
                [
                    companyId,
                    input.departmentId,
                    input.title,
                    input.description ?? null,
                    input.baseSalary ?? null,
                    input.active,
                ],
            );
            const id = result.rows[0].id;
            await addAuditLog(client, companyId, actor, "position.created", "position", id);
            await client.query("COMMIT");

            const position = await this.findPosition(companyId, id);
            return position!;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updatePosition(
        companyId: string,
        positionId: string,
        input: UpdatePositionInput,
        actor: AuditActor,
    ): Promise<Position | null> {
        const values: unknown[] = [];
        const assignments = buildAssignments(input, {
            departmentId: "department_id",
            title: "title",
            description: "description",
            baseSalary: "base_salary",
            active: "active",
        }, values);
        values.push(positionId, companyId);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE positions
                 SET ${assignments.join(", ")}
                 WHERE id = $${values.length - 1}
                   AND company_id = $${values.length}
                   AND deleted_at IS NULL
                 RETURNING id`,
                values,
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "position.updated",
                    "position",
                    positionId,
                    Object.keys(input),
                );
            }
            await client.query("COMMIT");

            return result.rows[0] ? this.findPosition(companyId, positionId) : null;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getPositionUsage(companyId: string, positionId: string): Promise<number> {
        const result = await database.query<{ links: number }>(
            `SELECT (
                (SELECT COUNT(*) FROM employees
                 WHERE company_id = $1 AND position_id = $2 AND deleted_at IS NULL)
                +
                (SELECT COUNT(*) FROM vacancies
                 WHERE company_id = $1 AND position_id = $2 AND deleted_at IS NULL
                   AND status IN ('draft', 'open', 'paused'))
             )::INTEGER AS links`,
            [companyId, positionId],
        );

        return result.rows[0].links;
    }

    async archivePosition(
        companyId: string,
        positionId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE positions
                 SET active = FALSE, deleted_at = NOW()
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 RETURNING id`,
                [positionId, companyId],
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "position.archived",
                    "position",
                    positionId,
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
}

export const organizationRepository = new OrganizationRepository();
