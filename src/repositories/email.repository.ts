import database from "../database/connection.js";

export interface EmailJob {
    id: string;
    companyId: string;
    recipient: string;
    template: string;
    subject: string;
    payload: Record<string, unknown>;
    attempts: number;
    maxAttempts: number;
}

interface EmailJobRow {
    id: string;
    company_id: string;
    recipient: string;
    template: string;
    subject: string;
    payload: Record<string, unknown>;
    attempts: number;
    max_attempts: number;
}

const mapEmailJob = (row: EmailJobRow): EmailJob => ({
    id: row.id,
    companyId: row.company_id,
    recipient: row.recipient,
    template: row.template,
    subject: row.subject,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
});

export class EmailRepository {
    async listActiveCompanyIds(): Promise<string[]> {
        const result = await database.query<{ company_id: string }>(
            "SELECT company_id FROM rhumi_active_company_ids()",
        );
        return result.rows.map((row) => row.company_id);
    }

    async listDueCompanyIds(maximumCompanies: number): Promise<string[]> {
        const result = await database.query<{ company_id: string }>(
            "SELECT company_id FROM rhumi_due_email_company_ids($1)",
            [maximumCompanies],
        );
        return result.rows.map((row) => row.company_id);
    }

    async claimBatch(
        companyId: string,
        batchSize: number,
        lockTimeoutMinutes: number,
    ): Promise<EmailJob[]> {
        const result = await database.query<EmailJobRow>(
            `WITH selected AS (
                SELECT id
                FROM email_outbox
                WHERE company_id = $1
                  AND (
                    (status = 'queued' AND available_at <= NOW())
                    OR (
                        status = 'processing'
                        AND locked_at < NOW() - make_interval(mins => $3)
                    )
                  )
                ORDER BY available_at, created_at
                FOR UPDATE SKIP LOCKED
                LIMIT $2
             )
             UPDATE email_outbox
             SET status = 'processing', locked_at = NOW(), attempts = attempts + 1
             FROM selected
             WHERE email_outbox.id = selected.id
             RETURNING email_outbox.id, email_outbox.company_id,
                email_outbox.recipient, email_outbox.template, email_outbox.subject,
                email_outbox.payload, email_outbox.attempts, email_outbox.max_attempts`,
            [companyId, batchSize, lockTimeoutMinutes],
        );
        return result.rows.map(mapEmailJob);
    }

    async markSent(jobId: string): Promise<void> {
        await database.query(
            `UPDATE email_outbox
             SET status = 'sent', sent_at = NOW(), locked_at = NULL,
                 last_error = NULL,
                 payload = payload - 'token' - 'actionUrl'
             WHERE id = $1`,
            [jobId],
        );
    }

    async markFailed(job: EmailJob, errorMessage: string, retryAt: Date): Promise<void> {
        await database.query(
            `UPDATE email_outbox
             SET status = CASE WHEN attempts >= max_attempts
                    THEN 'failed'::email_delivery_status
                    ELSE 'queued'::email_delivery_status
                 END,
                 available_at = CASE WHEN attempts >= max_attempts
                    THEN available_at ELSE $3 END,
                 locked_at = NULL,
                 last_error = LEFT($2, 2000),
                 payload = CASE WHEN attempts >= max_attempts
                    THEN payload - 'token' - 'actionUrl' ELSE payload END
             WHERE id = $1`,
            [job.id, errorMessage, retryAt],
        );
    }
}

export const emailRepository = new EmailRepository();
