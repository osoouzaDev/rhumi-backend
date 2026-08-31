import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    CandidateListQuery,
    CreateCandidateInput,
    UpdateCandidateInput,
} from "../schemas/recruitment.schemas.js";

export interface Candidate {
    id: string;
    companyId: string;
    fullName: string;
    email: string;
    phone: string | null;
    headline: string | null;
    city: string | null;
    state: string | null;
    linkedinUrl: string | null;
    resumeUrl: string | null;
    source: string | null;
    notes: string | null;
    applicationCount: number;
    activeApplicationCount: number;
    bestScore: number | null;
    latestApplication: {
        id: string;
        vacancyId: string;
        vacancyTitle: string;
        stage: string;
        score: number | null;
    } | null;
    createdAt: Date;
    updatedAt: Date;
}

interface CandidateRow {
    id: string;
    company_id: string;
    full_name: string;
    email: string;
    phone: string | null;
    headline: string | null;
    city: string | null;
    state: string | null;
    linkedin_url: string | null;
    resume_url: string | null;
    source: string | null;
    notes: string | null;
    application_count: number;
    active_application_count: number;
    best_score: string | null;
    latest_application_id: string | null;
    latest_vacancy_id: string | null;
    latest_vacancy_title: string | null;
    latest_stage: string | null;
    latest_score: string | null;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

const candidateColumns = `
    candidates.id, candidates.company_id, candidates.full_name, candidates.email,
    candidates.phone, candidates.headline, candidates.city, candidates.state,
    candidates.linkedin_url, candidates.resume_url, candidates.source, candidates.notes,
    COALESCE(application_stats.application_count, 0)::INTEGER AS application_count,
    COALESCE(application_stats.active_application_count, 0)::INTEGER AS active_application_count,
    application_stats.best_score,
    latest_application.id AS latest_application_id,
    latest_application.vacancy_id AS latest_vacancy_id,
    latest_application.vacancy_title AS latest_vacancy_title,
    latest_application.stage::TEXT AS latest_stage,
    latest_application.score AS latest_score,
    candidates.created_at, candidates.updated_at
`;

const candidateFrom = `
    FROM candidates
    LEFT JOIN LATERAL (
        SELECT COUNT(*)::INTEGER AS application_count,
               COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS active_application_count,
               MAX(score) AS best_score
        FROM job_applications
        WHERE job_applications.candidate_id = candidates.id
          AND job_applications.deleted_at IS NULL
    ) AS application_stats ON TRUE
    LEFT JOIN LATERAL (
        SELECT job_applications.id, job_applications.vacancy_id, vacancies.title AS vacancy_title,
               job_applications.stage, job_applications.score
        FROM job_applications
        INNER JOIN vacancies ON vacancies.id = job_applications.vacancy_id
        WHERE job_applications.candidate_id = candidates.id
          AND job_applications.deleted_at IS NULL
        ORDER BY job_applications.applied_at DESC
        LIMIT 1
    ) AS latest_application ON TRUE
`;

const mapCandidate = (row: CandidateRow): Candidate => ({
    id: row.id,
    companyId: row.company_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    headline: row.headline,
    city: row.city,
    state: row.state,
    linkedinUrl: row.linkedin_url,
    resumeUrl: row.resume_url,
    source: row.source,
    notes: row.notes,
    applicationCount: row.application_count,
    activeApplicationCount: row.active_application_count,
    bestScore: row.best_score === null ? null : Number(row.best_score),
    latestApplication: row.latest_application_id ? {
        id: row.latest_application_id,
        vacancyId: row.latest_vacancy_id!,
        vacancyTitle: row.latest_vacancy_title!,
        stage: row.latest_stage!,
        score: row.latest_score === null ? null : Number(row.latest_score),
    } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    candidateId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'candidate', $4, $5, $6::JSONB)`,
        [
            companyId, actor.userId, event, candidateId, actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const selectCandidateById = async (client: PoolClient, candidateId: string): Promise<Candidate> => {
    const result = await client.query<CandidateRow>(
        `SELECT ${candidateColumns} ${candidateFrom} WHERE candidates.id = $1`,
        [candidateId],
    );
    return mapCandidate(result.rows[0]);
};

export class CandidatesRepository {
    async list(companyId: string, query: CandidateListQuery): Promise<PaginatedResult<Candidate>> {
        const values: unknown[] = [companyId];
        const conditions = ["candidates.company_id = $1", "candidates.deleted_at IS NULL"];

        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(
                candidates.full_name ILIKE $${values.length}
                OR candidates.email ILIKE $${values.length}
                OR candidates.headline ILIKE $${values.length}
            )`);
        }
        if (query.vacancyId) {
            values.push(query.vacancyId);
            conditions.push(`EXISTS (
                SELECT 1 FROM job_applications
                WHERE job_applications.candidate_id = candidates.id
                  AND job_applications.vacancy_id = $${values.length}
                  AND job_applications.deleted_at IS NULL
            )`);
        }
        if (query.stage) {
            values.push(query.stage);
            conditions.push(`EXISTS (
                SELECT 1 FROM job_applications
                WHERE job_applications.candidate_id = candidates.id
                  AND job_applications.stage = $${values.length}
                  AND job_applications.deleted_at IS NULL
                  AND job_applications.status = 'active'
            )`);
        }
        if (query.minScore !== undefined) {
            values.push(query.minScore);
            conditions.push(`EXISTS (
                SELECT 1 FROM job_applications
                WHERE job_applications.candidate_id = candidates.id
                  AND job_applications.score >= $${values.length}
                  AND job_applications.deleted_at IS NULL
            )`);
        }

        const sortColumns: Record<CandidateListQuery["sortBy"], string> = {
            createdAt: "candidates.created_at",
            fullName: "candidates.full_name",
            score: "application_stats.best_score",
        };
        const direction = query.sortOrder === "asc" ? "ASC" : "DESC";
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<CandidateRow>(
            `SELECT ${candidateColumns}, COUNT(*) OVER()::INTEGER AS total
             ${candidateFrom}
             WHERE ${conditions.join(" AND ")}
             ORDER BY ${sortColumns[query.sortBy]} ${direction} NULLS LAST, candidates.id ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapCandidate),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findById(companyId: string, candidateId: string): Promise<Candidate | null> {
        const result = await database.query<CandidateRow>(
            `SELECT ${candidateColumns} ${candidateFrom}
             WHERE candidates.id = $1 AND candidates.company_id = $2
               AND candidates.deleted_at IS NULL LIMIT 1`,
            [candidateId, companyId],
        );
        return result.rows[0] ? mapCandidate(result.rows[0]) : null;
    }

    async create(
        companyId: string,
        input: CreateCandidateInput,
        actor: AuditActor,
    ): Promise<Candidate> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO candidates (
                    company_id, full_name, email, phone, headline, city, state,
                    linkedin_url, resume_url, source, notes
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING id`,
                [
                    companyId, input.fullName, input.email, input.phone ?? null,
                    input.headline ?? null, input.city ?? null, input.state ?? null,
                    input.linkedinUrl ?? null, input.resumeUrl ?? null,
                    input.source ?? null, input.notes ?? null,
                ],
            );
            const candidateId = result.rows[0].id;
            await addAuditLog(client, companyId, actor, "candidate.created", candidateId);
            const candidate = await selectCandidateById(client, candidateId);
            await client.query("COMMIT");
            return candidate;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        companyId: string,
        candidateId: string,
        input: UpdateCandidateInput,
        actor: AuditActor,
    ): Promise<Candidate | null> {
        const columns: Record<string, string> = {
            fullName: "full_name", email: "email", phone: "phone", headline: "headline",
            city: "city", state: "state", linkedinUrl: "linkedin_url",
            resumeUrl: "resume_url", source: "source", notes: "notes",
        };
        const values: unknown[] = [];
        const assignments = Object.entries(input)
            .filter(([, value]) => value !== undefined)
            .map(([field, value]) => {
                values.push(value);
                return `${columns[field]} = $${values.length}`;
            });
        values.push(candidateId, companyId);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE candidates SET ${assignments.join(", ")}
                 WHERE id = $${values.length - 1} AND company_id = $${values.length}
                   AND deleted_at IS NULL RETURNING id`,
                values,
            );
            if (!result.rows[0]) {
                await client.query("COMMIT");
                return null;
            }
            await addAuditLog(
                client, companyId, actor, "candidate.updated", candidateId, Object.keys(input),
            );
            const candidate = await selectCandidateById(client, candidateId);
            await client.query("COMMIT");
            return candidate;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async countActiveApplications(companyId: string, candidateId: string): Promise<number> {
        const result = await database.query<{ total: number }>(
            `SELECT COUNT(*)::INTEGER AS total FROM job_applications
             WHERE company_id = $1 AND candidate_id = $2
               AND status = 'active' AND deleted_at IS NULL`,
            [companyId, candidateId],
        );
        return result.rows[0].total;
    }

    async archive(companyId: string, candidateId: string, actor: AuditActor): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE candidates SET deleted_at = NOW()
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL RETURNING id`,
                [candidateId, companyId],
            );
            if (result.rows[0]) {
                await addAuditLog(client, companyId, actor, "candidate.archived", candidateId);
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

export const candidatesRepository = new CandidatesRepository();
