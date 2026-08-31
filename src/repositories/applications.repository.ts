import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    ApplicationListQuery,
    CreateApplicationInput,
    UpdateApplicationInput,
} from "../schemas/recruitment.schemas.js";

export interface JobApplication {
    id: string;
    companyId: string;
    vacancyId: string;
    vacancyTitle: string;
    candidateId: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string | null;
    candidateHeadline: string | null;
    candidateResumeUrl: string | null;
    stage: "applied" | "screening" | "interview" | "assessment" | "offer" | "hired" | "rejected";
    status: "active" | "withdrawn";
    score: number | null;
    recruiterNotes: string | null;
    appliedAt: Date;
    stageChangedAt: Date;
    hiredAt: Date | null;
    rejectedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface ApplicationStageHistory {
    id: number;
    fromStage: JobApplication["stage"] | null;
    toStage: JobApplication["stage"];
    notes: string | null;
    changedBy: string | null;
    changedAt: Date;
}

interface ApplicationRow {
    id: string;
    company_id: string;
    vacancy_id: string;
    vacancy_title: string;
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    candidate_phone: string | null;
    candidate_headline: string | null;
    candidate_resume_url: string | null;
    stage: JobApplication["stage"];
    status: JobApplication["status"];
    score: string | null;
    recruiter_notes: string | null;
    applied_at: Date;
    stage_changed_at: Date;
    hired_at: Date | null;
    rejected_at: Date | null;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

const applicationColumns = `
    job_applications.id, job_applications.company_id, job_applications.vacancy_id,
    vacancies.title AS vacancy_title, job_applications.candidate_id,
    candidates.full_name AS candidate_name, candidates.email AS candidate_email,
    candidates.phone AS candidate_phone, candidates.headline AS candidate_headline,
    candidates.resume_url AS candidate_resume_url, job_applications.stage,
    job_applications.status, job_applications.score, job_applications.recruiter_notes,
    job_applications.applied_at, job_applications.stage_changed_at,
    job_applications.hired_at, job_applications.rejected_at,
    job_applications.created_at, job_applications.updated_at
`;

const applicationFrom = `
    FROM job_applications
    INNER JOIN vacancies ON vacancies.id = job_applications.vacancy_id
    INNER JOIN candidates ON candidates.id = job_applications.candidate_id
`;

const mapApplication = (row: ApplicationRow): JobApplication => ({
    id: row.id,
    companyId: row.company_id,
    vacancyId: row.vacancy_id,
    vacancyTitle: row.vacancy_title,
    candidateId: row.candidate_id,
    candidateName: row.candidate_name,
    candidateEmail: row.candidate_email,
    candidatePhone: row.candidate_phone,
    candidateHeadline: row.candidate_headline,
    candidateResumeUrl: row.candidate_resume_url,
    stage: row.stage,
    status: row.status,
    score: row.score === null ? null : Number(row.score),
    recruiterNotes: row.recruiter_notes,
    appliedAt: row.applied_at,
    stageChangedAt: row.stage_changed_at,
    hiredAt: row.hired_at,
    rejectedAt: row.rejected_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    applicationId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'job_application', $4, $5, $6::JSONB)`,
        [
            companyId, actor.userId, event, applicationId, actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {}),
        ],
    );
};

const selectApplicationById = async (
    client: PoolClient,
    applicationId: string,
): Promise<JobApplication> => {
    const result = await client.query<ApplicationRow>(
        `SELECT ${applicationColumns} ${applicationFrom} WHERE job_applications.id = $1`,
        [applicationId],
    );
    return mapApplication(result.rows[0]);
};

export class ApplicationsRepository {
    async list(
        companyId: string,
        query: ApplicationListQuery,
    ): Promise<PaginatedResult<JobApplication>> {
        const values: unknown[] = [companyId];
        const conditions = [
            "job_applications.company_id = $1",
            "job_applications.deleted_at IS NULL",
        ];
        for (const [field, column] of [
            [query.vacancyId, "job_applications.vacancy_id"],
            [query.candidateId, "job_applications.candidate_id"],
            [query.stage, "job_applications.stage"],
            [query.status, "job_applications.status"],
        ] as const) {
            if (field !== undefined) {
                values.push(field);
                conditions.push(`${column} = $${values.length}`);
            }
        }

        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<ApplicationRow>(
            `SELECT ${applicationColumns}, COUNT(*) OVER()::INTEGER AS total
             ${applicationFrom}
             WHERE ${conditions.join(" AND ")}
             ORDER BY job_applications.score DESC NULLS LAST,
                      job_applications.applied_at DESC, job_applications.id ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapApplication),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async listForBoard(companyId: string, vacancyId: string): Promise<JobApplication[]> {
        const result = await database.query<ApplicationRow>(
            `SELECT ${applicationColumns} ${applicationFrom}
             WHERE job_applications.company_id = $1
               AND job_applications.vacancy_id = $2
               AND job_applications.status = 'active'
               AND job_applications.deleted_at IS NULL
             ORDER BY job_applications.score DESC NULLS LAST,
                      job_applications.stage_changed_at DESC`,
            [companyId, vacancyId],
        );
        return result.rows.map(mapApplication);
    }

    async findById(companyId: string, applicationId: string): Promise<JobApplication | null> {
        const result = await database.query<ApplicationRow>(
            `SELECT ${applicationColumns} ${applicationFrom}
             WHERE job_applications.id = $1 AND job_applications.company_id = $2
               AND job_applications.deleted_at IS NULL LIMIT 1`,
            [applicationId, companyId],
        );
        return result.rows[0] ? mapApplication(result.rows[0]) : null;
    }

    async getHistory(
        companyId: string,
        applicationId: string,
    ): Promise<ApplicationStageHistory[]> {
        const result = await database.query<{
            id: number;
            from_stage: ApplicationStageHistory["fromStage"];
            to_stage: ApplicationStageHistory["toStage"];
            notes: string | null;
            changed_by: string | null;
            changed_at: Date;
        }>(
            `SELECT history.id, history.from_stage, history.to_stage,
                    history.notes, history.changed_by, history.changed_at
             FROM application_stage_history AS history
             INNER JOIN job_applications ON job_applications.id = history.application_id
             WHERE history.application_id = $1 AND job_applications.company_id = $2
             ORDER BY history.changed_at DESC, history.id DESC`,
            [applicationId, companyId],
        );
        return result.rows.map((row) => ({
            id: row.id,
            fromStage: row.from_stage,
            toStage: row.to_stage,
            notes: row.notes,
            changedBy: row.changed_by,
            changedAt: row.changed_at,
        }));
    }

    async create(
        companyId: string,
        vacancyId: string,
        input: CreateApplicationInput,
        actor: AuditActor,
    ): Promise<JobApplication> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO job_applications (
                    company_id, vacancy_id, candidate_id, stage, score,
                    recruiter_notes, created_by, hired_at, rejected_at
                 ) VALUES (
                    $1, $2, $3, $4::recruitment_application_stage, $5, $6, $7,
                    CASE WHEN $4::recruitment_application_stage = 'hired' THEN NOW() ELSE NULL END,
                    CASE WHEN $4::recruitment_application_stage = 'rejected' THEN NOW() ELSE NULL END
                 ) RETURNING id`,
                [
                    companyId, vacancyId, input.candidateId, input.stage,
                    input.score ?? null, input.recruiterNotes ?? null, actor.userId,
                ],
            );
            const applicationId = result.rows[0].id;
            await client.query(
                `INSERT INTO application_stage_history (
                    application_id, from_stage, to_stage, changed_by
                 ) VALUES ($1, NULL, $2, $3)`,
                [applicationId, input.stage, actor.userId],
            );
            await addAuditLog(
                client, companyId, actor, "job_application.created", applicationId,
            );
            const application = await selectApplicationById(client, applicationId);
            await client.query("COMMIT");
            return application;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        companyId: string,
        applicationId: string,
        input: UpdateApplicationInput,
        actor: AuditActor,
    ): Promise<JobApplication | null> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const currentResult = await client.query<{
                stage: JobApplication["stage"];
                status: JobApplication["status"];
            }>(
                `SELECT stage, status FROM job_applications
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 FOR UPDATE`,
                [applicationId, companyId],
            );
            const current = currentResult.rows[0];
            if (!current) {
                await client.query("COMMIT");
                return null;
            }

            const values: unknown[] = [];
            const assignments: string[] = [];
            for (const [field, column] of [
                ["stage", "stage"],
                ["status", "status"],
                ["score", "score"],
                ["recruiterNotes", "recruiter_notes"],
            ] as const) {
                const value = input[field];
                if (value !== undefined) {
                    values.push(value);
                    assignments.push(`${column} = $${values.length}`);
                }
            }

            const stageChanged = input.stage !== undefined && input.stage !== current.stage;
            if (stageChanged) {
                assignments.push("stage_changed_at = NOW()");
                if (input.stage === "hired") {
                    assignments.push("hired_at = NOW()", "rejected_at = NULL");
                } else if (input.stage === "rejected") {
                    assignments.push("rejected_at = NOW()", "hired_at = NULL");
                } else {
                    assignments.push("hired_at = NULL", "rejected_at = NULL");
                }
            }

            if (assignments.length > 0) {
                values.push(applicationId);
                await client.query(
                    `UPDATE job_applications
                     SET ${[...new Set(assignments)].join(", ")}
                     WHERE id = $${values.length}`,
                    values,
                );
            }
            if (stageChanged) {
                await client.query(
                    `INSERT INTO application_stage_history (
                        application_id, from_stage, to_stage, changed_by, notes
                     ) VALUES ($1, $2, $3, $4, $5)`,
                    [applicationId, current.stage, input.stage, actor.userId, input.stageNotes ?? null],
                );
            }

            await addAuditLog(
                client,
                companyId,
                actor,
                "job_application.updated",
                applicationId,
                Object.keys(input),
            );
            const application = await selectApplicationById(client, applicationId);

            if (stageChanged && input.stage === "hired") {
                await client.query(
                    `UPDATE vacancies
                     SET status = 'closed'
                     WHERE id = $1 AND status = 'open'
                       AND openings <= (
                           SELECT COUNT(*) FROM job_applications
                           WHERE vacancy_id = $1 AND stage = 'hired'
                             AND status = 'active' AND deleted_at IS NULL
                       )`,
                    [application.vacancyId],
                );
            }

            await client.query("COMMIT");
            return application;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async withdraw(
        companyId: string,
        applicationId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE job_applications
                 SET status = 'withdrawn', deleted_at = NOW()
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL RETURNING id`,
                [applicationId, companyId],
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client, companyId, actor, "job_application.withdrawn", applicationId,
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

export const applicationsRepository = new ApplicationsRepository();


