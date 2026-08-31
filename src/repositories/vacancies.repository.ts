import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    CreateVacancyInput,
    UpdateVacancyInput,
    VacancyListQuery,
} from "../schemas/recruitment.schemas.js";

export interface VacancyStageCounts {
    applied: number;
    screening: number;
    interview: number;
    assessment: number;
    offer: number;
    hired: number;
    rejected: number;
}

export interface Vacancy {
    id: string;
    companyId: string;
    departmentId: string;
    departmentName: string;
    positionId: string;
    positionTitle: string;
    title: string;
    slug: string;
    description: string;
    responsibilities: string | null;
    requirements: string | null;
    location: string | null;
    contractType: "clt" | "pj";
    workModel: "onsite" | "hybrid" | "remote";
    status: "draft" | "open" | "paused" | "closed" | "cancelled";
    openings: number;
    salaryMin: number | null;
    salaryMax: number | null;
    publishedAt: Date | null;
    closesAt: Date | null;
    applicationCount: number;
    stageCounts: VacancyStageCounts;
    createdAt: Date;
    updatedAt: Date;
}

interface VacancyRow {
    id: string;
    company_id: string;
    department_id: string;
    department_name: string;
    position_id: string;
    position_title: string;
    title: string;
    slug: string;
    description: string;
    responsibilities: string | null;
    requirements: string | null;
    location: string | null;
    contract_type: Vacancy["contractType"];
    work_model: Vacancy["workModel"];
    status: Vacancy["status"];
    openings: number;
    salary_min: string | null;
    salary_max: string | null;
    published_at: Date | null;
    closes_at: Date | null;
    application_count: number;
    applied_count: number;
    screening_count: number;
    interview_count: number;
    assessment_count: number;
    offer_count: number;
    hired_count: number;
    rejected_count: number;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

const vacancyColumns = `
    vacancies.id, vacancies.company_id, vacancies.department_id,
    departments.name AS department_name, vacancies.position_id,
    positions.title AS position_title, vacancies.title, vacancies.slug,
    vacancies.description, vacancies.responsibilities, vacancies.requirements,
    vacancies.location, vacancies.contract_type, vacancies.work_model,
    vacancies.status, vacancies.openings, vacancies.salary_min, vacancies.salary_max,
    vacancies.published_at, vacancies.closes_at, vacancies.created_at, vacancies.updated_at,
    COALESCE(application_stats.application_count, 0)::INTEGER AS application_count,
    COALESCE(application_stats.applied_count, 0)::INTEGER AS applied_count,
    COALESCE(application_stats.screening_count, 0)::INTEGER AS screening_count,
    COALESCE(application_stats.interview_count, 0)::INTEGER AS interview_count,
    COALESCE(application_stats.assessment_count, 0)::INTEGER AS assessment_count,
    COALESCE(application_stats.offer_count, 0)::INTEGER AS offer_count,
    COALESCE(application_stats.hired_count, 0)::INTEGER AS hired_count,
    COALESCE(application_stats.rejected_count, 0)::INTEGER AS rejected_count
`;

const vacancyFrom = `
    FROM vacancies
    INNER JOIN departments ON departments.id = vacancies.department_id
    INNER JOIN positions ON positions.id = vacancies.position_id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(*)::INTEGER AS application_count,
            COUNT(*) FILTER (WHERE stage = 'applied')::INTEGER AS applied_count,
            COUNT(*) FILTER (WHERE stage = 'screening')::INTEGER AS screening_count,
            COUNT(*) FILTER (WHERE stage = 'interview')::INTEGER AS interview_count,
            COUNT(*) FILTER (WHERE stage = 'assessment')::INTEGER AS assessment_count,
            COUNT(*) FILTER (WHERE stage = 'offer')::INTEGER AS offer_count,
            COUNT(*) FILTER (WHERE stage = 'hired')::INTEGER AS hired_count,
            COUNT(*) FILTER (WHERE stage = 'rejected')::INTEGER AS rejected_count
        FROM job_applications
        WHERE job_applications.vacancy_id = vacancies.id
          AND job_applications.deleted_at IS NULL
          AND job_applications.status = 'active'
    ) AS application_stats ON TRUE
`;

const mapVacancy = (row: VacancyRow): Vacancy => ({
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    positionId: row.position_id,
    positionTitle: row.position_title,
    title: row.title,
    slug: row.slug,
    description: row.description,
    responsibilities: row.responsibilities,
    requirements: row.requirements,
    location: row.location,
    contractType: row.contract_type,
    workModel: row.work_model,
    status: row.status,
    openings: row.openings,
    salaryMin: row.salary_min === null ? null : Number(row.salary_min),
    salaryMax: row.salary_max === null ? null : Number(row.salary_max),
    publishedAt: row.published_at,
    closesAt: row.closes_at,
    applicationCount: row.application_count,
    stageCounts: {
        applied: row.applied_count,
        screening: row.screening_count,
        interview: row.interview_count,
        assessment: row.assessment_count,
        offer: row.offer_count,
        hired: row.hired_count,
        rejected: row.rejected_count,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    vacancyId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'vacancy', $4, $5, $6::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            vacancyId,
            actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const selectVacancyById = async (client: PoolClient, vacancyId: string): Promise<Vacancy> => {
    const result = await client.query<VacancyRow>(
        `SELECT ${vacancyColumns} ${vacancyFrom} WHERE vacancies.id = $1`,
        [vacancyId],
    );
    return mapVacancy(result.rows[0]);
};

export class VacanciesRepository {
    async list(companyId: string, query: VacancyListQuery): Promise<PaginatedResult<Vacancy>> {
        const values: unknown[] = [companyId];
        const conditions = ["vacancies.company_id = $1", "vacancies.deleted_at IS NULL"];

        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(
                vacancies.title ILIKE $${values.length}
                OR departments.name ILIKE $${values.length}
                OR positions.title ILIKE $${values.length}
            )`);
        }
        for (const [field, column] of [
            [query.departmentId, "vacancies.department_id"],
            [query.positionId, "vacancies.position_id"],
            [query.status, "vacancies.status"],
            [query.contractType, "vacancies.contract_type"],
            [query.workModel, "vacancies.work_model"],
        ] as const) {
            if (field !== undefined) {
                values.push(field);
                conditions.push(`${column} = $${values.length}`);
            }
        }

        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<VacancyRow>(
            `SELECT ${vacancyColumns}, COUNT(*) OVER()::INTEGER AS total
             ${vacancyFrom}
             WHERE ${conditions.join(" AND ")}
             ORDER BY vacancies.created_at DESC, vacancies.id ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapVacancy),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findById(companyId: string, vacancyId: string): Promise<Vacancy | null> {
        const result = await database.query<VacancyRow>(
            `SELECT ${vacancyColumns} ${vacancyFrom}
             WHERE vacancies.id = $1
               AND vacancies.company_id = $2
               AND vacancies.deleted_at IS NULL
             LIMIT 1`,
            [vacancyId, companyId],
        );
        return result.rows[0] ? mapVacancy(result.rows[0]) : null;
    }

    async slugExists(companyId: string, slug: string, exceptId?: string): Promise<boolean> {
        const result = await database.query<{ exists: boolean }>(
            `SELECT EXISTS (
                SELECT 1 FROM vacancies
                WHERE company_id = $1 AND LOWER(slug) = LOWER($2)
                  AND deleted_at IS NULL AND ($3::UUID IS NULL OR id <> $3)
            ) AS exists`,
            [companyId, slug, exceptId ?? null],
        );
        return result.rows[0].exists;
    }

    async create(
        companyId: string,
        input: CreateVacancyInput & { slug: string },
        actor: AuditActor,
    ): Promise<Vacancy> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO vacancies (
                    company_id, department_id, position_id, title, slug, description,
                    responsibilities, requirements, location, contract_type, work_model,
                    status, openings, salary_min, salary_max, published_at, closes_at, created_by
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
                 ) RETURNING id`,
                [
                    companyId, input.departmentId, input.positionId, input.title, input.slug,
                    input.description, input.responsibilities ?? null, input.requirements ?? null,
                    input.location ?? null, input.contractType, input.workModel, input.status,
                    input.openings, input.salaryMin ?? null, input.salaryMax ?? null,
                    input.publishedAt ?? null, input.closesAt ?? null, actor.userId,
                ],
            );
            const vacancyId = result.rows[0].id;
            await addAuditLog(client, companyId, actor, "vacancy.created", vacancyId);
            const vacancy = await selectVacancyById(client, vacancyId);
            await client.query("COMMIT");
            return vacancy;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        companyId: string,
        vacancyId: string,
        input: UpdateVacancyInput,
        actor: AuditActor,
    ): Promise<Vacancy | null> {
        const columns: Record<string, string> = {
            departmentId: "department_id", positionId: "position_id", title: "title",
            slug: "slug", description: "description", responsibilities: "responsibilities",
            requirements: "requirements", location: "location", contractType: "contract_type",
            workModel: "work_model", status: "status", openings: "openings",
            salaryMin: "salary_min", salaryMax: "salary_max", publishedAt: "published_at",
            closesAt: "closes_at",
        };
        const values: unknown[] = [];
        const assignments = Object.entries(input)
            .filter(([, value]) => value !== undefined)
            .map(([field, value]) => {
                values.push(value);
                return `${columns[field]} = $${values.length}`;
            });
        values.push(vacancyId, companyId);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE vacancies SET ${assignments.join(", ")}
                 WHERE id = $${values.length - 1} AND company_id = $${values.length}
                   AND deleted_at IS NULL
                 RETURNING id`,
                values,
            );
            if (!result.rows[0]) {
                await client.query("COMMIT");
                return null;
            }
            await addAuditLog(
                client, companyId, actor, "vacancy.updated", vacancyId, Object.keys(input),
            );
            const vacancy = await selectVacancyById(client, vacancyId);
            await client.query("COMMIT");
            return vacancy;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async countActiveApplications(companyId: string, vacancyId: string): Promise<number> {
        const result = await database.query<{ total: number }>(
            `SELECT COUNT(*)::INTEGER AS total FROM job_applications
             WHERE company_id = $1 AND vacancy_id = $2
               AND status = 'active' AND deleted_at IS NULL`,
            [companyId, vacancyId],
        );
        return result.rows[0].total;
    }

    async archive(companyId: string, vacancyId: string, actor: AuditActor): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE vacancies SET status = 'cancelled', deleted_at = NOW()
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL RETURNING id`,
                [vacancyId, companyId],
            );
            if (result.rows[0]) {
                await addAuditLog(client, companyId, actor, "vacancy.archived", vacancyId);
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

export const vacanciesRepository = new VacanciesRepository();
