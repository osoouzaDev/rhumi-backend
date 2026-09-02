import type { PoolClient } from "pg";
import database from "../database/connection.js";
import { AppError } from "../errors/app-error.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    CreatePrivacyRequestInput,
    PrivacyRequestListQuery,
    RecordConsentInput,
} from "../schemas/privacy.schemas.js";

export interface PrivacyConsent {
    id: string;
    employeeId: string;
    purpose: string;
    policyVersion: string;
    legalBasis: string;
    granted: boolean;
    createdAt: Date;
}

export interface PrivacyRequestRecord {
    id: string;
    companyId: string;
    employeeId: string;
    requestedByUserId: string;
    type: "export" | "anonymization" | "deletion";
    status: "pending" | "processing" | "completed" | "rejected";
    reason: string | null;
    resultFileId: string | null;
    processedByUserId: string | null;
    processingNotes: string | null;
    createdAt: Date;
    processedAt: Date | null;
}

interface PrivacyConsentRow {
    id: string;
    employee_id: string;
    purpose: string;
    policy_version: string;
    legal_basis: string;
    granted: boolean;
    created_at: Date;
}

interface PrivacyRequestRow {
    id: string;
    company_id: string;
    employee_id: string;
    requested_by_user_id: string;
    request_type: PrivacyRequestRecord["type"];
    status: PrivacyRequestRecord["status"];
    reason: string | null;
    result_file_id: string | null;
    processed_by_user_id: string | null;
    processing_notes: string | null;
    created_at: Date;
    processed_at: Date | null;
    total?: number;
}

const mapConsent = (row: PrivacyConsentRow): PrivacyConsent => ({
    id: row.id,
    employeeId: row.employee_id,
    purpose: row.purpose,
    policyVersion: row.policy_version,
    legalBasis: row.legal_basis,
    granted: row.granted,
    createdAt: row.created_at,
});

const mapRequest = (row: PrivacyRequestRow): PrivacyRequestRecord => ({
    id: row.id,
    companyId: row.company_id,
    employeeId: row.employee_id,
    requestedByUserId: row.requested_by_user_id,
    type: row.request_type,
    status: row.status,
    reason: row.reason,
    resultFileId: row.result_file_id,
    processedByUserId: row.processed_by_user_id,
    processingNotes: row.processing_notes,
    createdAt: row.created_at,
    processedAt: row.processed_at,
});

const audit = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    entityId: string,
    context: Record<string, unknown>,
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'privacy_request', $4, $5, $6::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            entityId,
            actor.requestId ?? null,
            JSON.stringify(context),
        ],
    );
};

const selectRequest = `
    id, company_id, employee_id, requested_by_user_id, request_type, status,
    reason, result_file_id, processed_by_user_id, processing_notes, created_at,
    processed_at
`;

export class PrivacyRepository {
    async recordConsent(
        companyId: string,
        employeeId: string,
        userId: string,
        input: RecordConsentInput,
        metadata: { ipAddress?: string; userAgent?: string },
    ): Promise<PrivacyConsent> {
        const result = await database.query<PrivacyConsentRow>(
            `INSERT INTO privacy_consents (
                company_id, employee_id, purpose, policy_version, legal_basis,
                granted, recorded_by_user_id, ip_address, user_agent
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, employee_id, purpose, policy_version, legal_basis,
                       granted, created_at`,
            [
                companyId,
                employeeId,
                input.purpose,
                input.policyVersion,
                input.legalBasis,
                input.granted,
                userId,
                metadata.ipAddress ?? null,
                metadata.userAgent ?? null,
            ],
        );
        return mapConsent(result.rows[0]);
    }

    async listConsents(companyId: string, employeeId: string): Promise<PrivacyConsent[]> {
        const result = await database.query<PrivacyConsentRow>(
            `SELECT id, employee_id, purpose, policy_version, legal_basis, granted, created_at
             FROM privacy_consents
             WHERE company_id = $1 AND employee_id = $2
             ORDER BY created_at DESC`,
            [companyId, employeeId],
        );
        return result.rows.map(mapConsent);
    }

    async createRequest(
        companyId: string,
        employeeId: string,
        userId: string,
        input: CreatePrivacyRequestInput,
        actor: AuditActor,
    ): Promise<PrivacyRequestRecord> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<PrivacyRequestRow>(
                `INSERT INTO privacy_requests (
                    company_id, employee_id, requested_by_user_id, request_type, reason
                 ) VALUES ($1, $2, $3, $4, $5)
                 RETURNING ${selectRequest}`,
                [companyId, employeeId, userId, input.type, input.reason ?? null],
            );
            const request = mapRequest(result.rows[0]);
            await audit(client, companyId, actor, "privacy.requested", request.id, {
                type: request.type,
                employeeId,
            });
            await client.query("COMMIT");
            return request;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listRequests(
        companyId: string,
        query: PrivacyRequestListQuery,
        forcedEmployeeId?: string,
    ): Promise<PaginatedResult<PrivacyRequestRecord>> {
        const values: unknown[] = [companyId];
        const conditions = ["company_id = $1"];
        const employeeId = forcedEmployeeId ?? query.employeeId;
        if (employeeId) {
            values.push(employeeId);
            conditions.push(`employee_id = $${values.length}`);
        }
        if (query.status) {
            values.push(query.status);
            conditions.push(`status = $${values.length}`);
        }
        if (query.type) {
            values.push(query.type);
            conditions.push(`request_type = $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<PrivacyRequestRow>(
            `SELECT ${selectRequest}, COUNT(*) OVER()::INTEGER AS total
             FROM privacy_requests
             WHERE ${conditions.join(" AND ")}
             ORDER BY created_at DESC, id
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapRequest),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findRequest(companyId: string, requestId: string): Promise<PrivacyRequestRecord | null> {
        const result = await database.query<PrivacyRequestRow>(
            `SELECT ${selectRequest}
             FROM privacy_requests
             WHERE id = $1 AND company_id = $2
             LIMIT 1`,
            [requestId, companyId],
        );
        return result.rows[0] ? mapRequest(result.rows[0]) : null;
    }

    async exportEmployeeData(companyId: string, employeeId: string): Promise<object> {
        const employee = await database.query(
            `SELECT employees.id, employees.employee_code, employees.full_name,
                    employees.email, employees.phone, employees.contract_type,
                    employees.status, employees.admission_date, employees.termination_date,
                    employees.created_at, departments.name AS department,
                    positions.title AS position
             FROM employees
             INNER JOIN departments ON departments.id = employees.department_id
             INNER JOIN positions ON positions.id = employees.position_id
             WHERE employees.id = $1 AND employees.company_id = $2
             LIMIT 1`,
            [employeeId, companyId],
        );
        if (!employee.rows[0]) {
            throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador não encontrado.");
        }
        const user = await database.query<{ id: string }>(
            `SELECT id, status, activated_at, email_verified_at, last_login_at,
                    password_changed_at, created_at
             FROM users WHERE employee_id = $1 LIMIT 1`,
            [employeeId],
        );
        const userId = user.rows[0]?.id;
        const queries: Array<Promise<unknown>> = [
            database.query(
                `SELECT roles.code, roles.name, user_roles.assigned_at
                 FROM user_roles INNER JOIN roles ON roles.id = user_roles.role_id
                 WHERE user_roles.user_id = $1`,
                [userId ?? null],
            ),
            database.query(
                `SELECT id, ip_address, user_agent, created_at, last_used_at,
                        expires_at, revoked_at, revocation_reason
                 FROM sessions WHERE user_id = $1 ORDER BY created_at DESC`,
                [userId ?? null],
            ),
            database.query(
                `SELECT type, title, description, priority, action_url, due_at,
                        read_at, dismissed_at, resolved_at, created_at
                 FROM notifications WHERE recipient_employee_id = $1 ORDER BY created_at DESC`,
                [employeeId],
            ),
            database.query(
                `SELECT calendar_events.title, calendar_events.description,
                        calendar_events.starts_at, calendar_events.ends_at,
                        calendar_event_attendees.response
                 FROM calendar_event_attendees
                 INNER JOIN calendar_events ON calendar_events.id = calendar_event_attendees.event_id
                 WHERE calendar_event_attendees.employee_id = $1`,
                [employeeId],
            ),
            database.query(
                `SELECT training_enrollments.*
                 FROM training_enrollments
                 WHERE employee_id = $1`,
                [employeeId],
            ),
            database.query(
                `SELECT journey_assignments.*
                 FROM journey_assignments
                 WHERE employee_id = $1 OR owner_employee_id = $1`,
                [employeeId],
            ),
            database.query(
                `SELECT evaluation_assignments.*
                 FROM evaluation_assignments
                 WHERE employee_id = $1 OR evaluator_employee_id = $1`,
                [employeeId],
            ),
            database.query(
                `SELECT development_plans.*
                 FROM development_plans
                 WHERE employee_id = $1 OR manager_employee_id = $1`,
                [employeeId],
            ),
            database.query(
                `SELECT purpose, policy_version, legal_basis, granted, created_at
                 FROM privacy_consents WHERE employee_id = $1 ORDER BY created_at`,
                [employeeId],
            ),
            database.query(
                `SELECT request_type, status, reason, processing_notes, created_at, processed_at
                 FROM privacy_requests WHERE employee_id = $1 ORDER BY created_at`,
                [employeeId],
            ),
            database.query(
                `SELECT id, purpose, original_name, mime_type, byte_size, sha256,
                        scan_status, retention_until, created_at
                 FROM stored_files WHERE owner_employee_id = $1 AND deleted_at IS NULL`,
                [employeeId],
            ),
        ];
        const results = await Promise.all(queries) as Array<{ rows: unknown[] }>;
        return {
            exportedAt: new Date().toISOString(),
            employee: employee.rows[0],
            account: user.rows[0] ?? null,
            roles: results[0].rows,
            sessions: results[1].rows,
            notifications: results[2].rows,
            calendar: results[3].rows,
            trainings: results[4].rows,
            journeys: results[5].rows,
            evaluations: results[6].rows,
            development: results[7].rows,
            consents: results[8].rows,
            privacyRequests: results[9].rows,
            files: results[10].rows,
        };
    }

    async rejectRequest(
        request: PrivacyRequestRecord,
        notes: string,
        actor: AuditActor,
    ): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `UPDATE privacy_requests
                 SET status = 'rejected', processed_by_user_id = $2,
                     processing_notes = $3, processed_at = NOW()
                 WHERE id = $1 AND status = 'pending'`,
                [request.id, actor.userId, notes],
            );
            await audit(client, request.companyId, actor, "privacy.rejected", request.id, {
                type: request.type,
            });
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async completeExport(
        request: PrivacyRequestRecord,
        resultFileId: string,
        notes: string,
        actor: AuditActor,
    ): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `UPDATE privacy_requests
                 SET status = 'completed', result_file_id = $2,
                     processed_by_user_id = $3, processing_notes = $4, processed_at = NOW()
                 WHERE id = $1 AND status = 'pending'`,
                [request.id, resultFileId, actor.userId, notes],
            );
            await audit(client, request.companyId, actor, "privacy.export_completed", request.id, {
                resultFileId,
            });
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async anonymize(
        request: PrivacyRequestRecord,
        notes: string,
        actor: AuditActor,
    ): Promise<string[]> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const employee = await client.query<{ status: string }>(
                `SELECT status FROM employees
                 WHERE id = $1 AND company_id = $2 FOR UPDATE`,
                [request.employeeId, request.companyId],
            );
            if (!employee.rows[0]) {
                throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador não encontrado.");
            }
            if (employee.rows[0].status !== "inactive") {
                throw new AppError(
                    409,
                    "EMPLOYEE_MUST_BE_INACTIVE",
                    "Inative o vínculo antes de anonimizar ou excluir os dados.",
                );
            }
            const files = await client.query<{ storage_key: string }>(
                `UPDATE stored_files SET deleted_at = NOW()
                 WHERE owner_employee_id = $1 AND deleted_at IS NULL
                 RETURNING storage_key`,
                [request.employeeId],
            );
            await client.query(
                `UPDATE file_access_tokens SET revoked_at = NOW()
                 WHERE file_id IN (
                    SELECT id FROM stored_files WHERE owner_employee_id = $1
                 ) AND revoked_at IS NULL`,
                [request.employeeId],
            );
            const users = await client.query<{ id: string }>(
                `UPDATE users
                 SET status = 'inactive', failed_login_attempts = 0, locked_until = NULL,
                     password_hash = 'anonymized:' || ENCODE(gen_random_bytes(32), 'hex'),
                     deleted_at = COALESCE(deleted_at, NOW())
                 WHERE employee_id = $1
                 RETURNING id`,
                [request.employeeId],
            );
            const userId = users.rows[0]?.id;
            if (userId) {
                await client.query(
                    `UPDATE sessions SET revoked_at = COALESCE(revoked_at, NOW()),
                        revocation_reason = COALESCE(revocation_reason, 'privacy_request')
                     WHERE user_id = $1`,
                    [userId],
                );
                await client.query("DELETE FROM mfa_login_challenges WHERE user_id = $1", [userId]);
                await client.query("DELETE FROM mfa_authenticators WHERE user_id = $1", [userId]);
                await client.query(
                    "UPDATE account_tokens SET consumed_at = COALESCE(consumed_at, NOW()) WHERE user_id = $1",
                    [userId],
                );
                await client.query("DELETE FROM notification_digest_deliveries WHERE user_id = $1", [userId]);
                await client.query("DELETE FROM notification_preferences WHERE user_id = $1", [userId]);
                await client.query("DELETE FROM notifications WHERE recipient_user_id = $1", [userId]);
            }
            await client.query(
                `UPDATE employees
                 SET employee_code = 'ANON-' || SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 12),
                     full_name = 'Titular anonimizado ' || SUBSTRING(id::TEXT FROM 1 FOR 8),
                     email = 'anon+' || REPLACE(id::TEXT, '-', '') || '@invalid.local',
                     phone = NULL,
                     deleted_at = COALESCE(deleted_at, NOW())
                 WHERE id = $1`,
                [request.employeeId],
            );
            await client.query(
                `UPDATE privacy_requests
                 SET status = 'completed', processed_by_user_id = $2,
                     processing_notes = $3, processed_at = NOW()
                 WHERE id = $1 AND status = 'pending'`,
                [request.id, actor.userId, notes],
            );
            await audit(client, request.companyId, actor, "privacy.data_anonymized", request.id, {
                type: request.type,
                employeeId: request.employeeId,
            });
            await client.query("COMMIT");
            return files.rows.map((row) => row.storage_key);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}

export const privacyRepository = new PrivacyRepository();
