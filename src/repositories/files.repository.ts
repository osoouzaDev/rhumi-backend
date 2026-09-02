import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { FileListQuery } from "../schemas/files.schemas.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface StoredFile {
    id: string;
    companyId: string;
    uploadedByUserId: string;
    ownerEmployeeId: string | null;
    purpose: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    storageKey: string;
    scanStatus: "not_scanned" | "clean" | "infected" | "error";
    scanDetail: string | null;
    retentionUntil: Date | null;
    createdAt: Date;
    deletedAt: Date | null;
}

interface StoredFileRow {
    id: string;
    company_id: string;
    uploaded_by_user_id: string;
    owner_employee_id: string | null;
    purpose: string;
    original_name: string;
    mime_type: string;
    byte_size: string;
    sha256: string;
    storage_key: string;
    scan_status: StoredFile["scanStatus"];
    scan_detail: string | null;
    retention_until: Date | null;
    created_at: Date;
    deleted_at: Date | null;
    total?: number;
}

interface CreateStoredFile {
    companyId: string;
    uploadedByUserId: string;
    ownerEmployeeId?: string;
    purpose: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    storageKey: string;
    scanStatus: StoredFile["scanStatus"];
    scanDetail: string;
    retentionUntil?: Date;
}

const selectColumns = `
    id, company_id, uploaded_by_user_id, owner_employee_id, purpose,
    original_name, mime_type, byte_size, sha256, storage_key, scan_status,
    scan_detail, retention_until, created_at, deleted_at
`;

const mapStoredFile = (row: StoredFileRow): StoredFile => ({
    id: row.id,
    companyId: row.company_id,
    uploadedByUserId: row.uploaded_by_user_id,
    ownerEmployeeId: row.owner_employee_id,
    purpose: row.purpose,
    originalName: row.original_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    storageKey: row.storage_key,
    scanStatus: row.scan_status,
    scanDetail: row.scan_detail,
    retentionUntil: row.retention_until,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
});

const addAudit = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    fileId: string,
    context: Record<string, unknown> = {},
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'stored_file', $4, $5, $6::JSONB)`,
        [
            companyId,
            actor.userId,
            event,
            fileId,
            actor.requestId ?? null,
            JSON.stringify(context),
        ],
    );
};

export class FilesRepository {
    async create(input: CreateStoredFile, actor: AuditActor): Promise<StoredFile> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<StoredFileRow>(
                `INSERT INTO stored_files (
                    company_id, uploaded_by_user_id, owner_employee_id, purpose,
                    original_name, mime_type, byte_size, sha256, storage_key,
                    scan_status, scan_detail, retention_until
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 RETURNING ${selectColumns}`,
                [
                    input.companyId,
                    input.uploadedByUserId,
                    input.ownerEmployeeId ?? null,
                    input.purpose,
                    input.originalName,
                    input.mimeType,
                    input.byteSize,
                    input.sha256,
                    input.storageKey,
                    input.scanStatus,
                    input.scanDetail,
                    input.retentionUntil ?? null,
                ],
            );
            const storedFile = mapStoredFile(result.rows[0]);
            await addAudit(client, input.companyId, actor, "file.uploaded", storedFile.id, {
                ownerEmployeeId: input.ownerEmployeeId,
                purpose: input.purpose,
                sha256: input.sha256,
            });
            await client.query("COMMIT");
            return storedFile;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async list(
        companyId: string,
        query: FileListQuery,
        ownerEmployeeId?: string,
    ): Promise<PaginatedResult<StoredFile>> {
        const values: unknown[] = [companyId];
        const conditions = ["company_id = $1", "deleted_at IS NULL"];
        const effectiveOwner = ownerEmployeeId ?? query.ownerEmployeeId;
        if (effectiveOwner) {
            values.push(effectiveOwner);
            conditions.push(`owner_employee_id = $${values.length}`);
        }
        if (query.purpose) {
            values.push(query.purpose);
            conditions.push(`purpose = $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<StoredFileRow>(
            `SELECT ${selectColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM stored_files
             WHERE ${conditions.join(" AND ")}
             ORDER BY created_at DESC, id
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapStoredFile),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findById(companyId: string, fileId: string): Promise<StoredFile | null> {
        const result = await database.query<StoredFileRow>(
            `SELECT ${selectColumns}
             FROM stored_files
             WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [fileId, companyId],
        );
        return result.rows[0] ? mapStoredFile(result.rows[0]) : null;
    }

    async createAccessToken(
        file: StoredFile,
        tokenHash: string,
        expiresAt: Date,
        maxDownloads: number,
        actor: AuditActor,
    ): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `INSERT INTO file_access_tokens (
                    company_id, file_id, token_hash, expires_at, max_downloads,
                    created_by_user_id
                 ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [file.companyId, file.id, tokenHash, expiresAt, maxDownloads, actor.userId],
            );
            await addAudit(client, file.companyId, actor, "file.link_created", file.id, {
                expiresAt,
                maxDownloads,
            });
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async resolveTokenCompany(tokenHash: string): Promise<string | null> {
        const result = await database.query<{ company_id: string | null }>(
            "SELECT rhumi_resolve_file_token_company($1) AS company_id",
            [tokenHash],
        );
        return result.rows[0]?.company_id ?? null;
    }

    async findByAccessToken(tokenHash: string): Promise<StoredFile | null> {
        const result = await database.query<StoredFileRow>(
            `SELECT ${selectColumns.replaceAll(/\b(id|company_id|created_at)\b/g, "stored_files.$1")}
             FROM file_access_tokens
             INNER JOIN stored_files ON stored_files.id = file_access_tokens.file_id
             WHERE file_access_tokens.token_hash = $1
               AND stored_files.deleted_at IS NULL
             LIMIT 1`,
            [tokenHash],
        );
        return result.rows[0] ? mapStoredFile(result.rows[0]) : null;
    }

    async archive(file: StoredFile, actor: AuditActor): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `UPDATE stored_files SET deleted_at = NOW()
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
                [file.id, file.companyId],
            );
            if (result.rowCount) {
                await client.query(
                    "UPDATE file_access_tokens SET revoked_at = NOW() WHERE file_id = $1",
                    [file.id],
                );
                await addAudit(client, file.companyId, actor, "file.deleted", file.id);
            }
            await client.query("COMMIT");
            return Boolean(result.rowCount);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listExpired(companyId: string, limit: number): Promise<StoredFile[]> {
        const result = await database.query<StoredFileRow>(
            `SELECT ${selectColumns}
             FROM stored_files
             WHERE company_id = $1 AND deleted_at IS NULL
               AND retention_until IS NOT NULL AND retention_until <= NOW()
             ORDER BY retention_until
             LIMIT $2`,
            [companyId, limit],
        );
        return result.rows.map(mapStoredFile);
    }

    async markRetentionDeleted(fileId: string): Promise<void> {
        await database.query(
            `WITH archived AS (
                UPDATE stored_files SET deleted_at = NOW()
                WHERE id = $1 AND deleted_at IS NULL
                RETURNING company_id
             ), revoked AS (
                UPDATE file_access_tokens SET revoked_at = NOW()
                WHERE file_id = $1 AND revoked_at IS NULL
             )
             INSERT INTO audit_logs (company_id, event, entity_type, entity_id, context)
             SELECT company_id, 'file.retention_deleted', 'stored_file', $1,
                    '{"automated":true}'::JSONB
             FROM archived`,
            [fileId],
        );
    }

    async cleanupExpiredTokens(): Promise<void> {
        await database.query(
            `DELETE FROM file_access_tokens
             WHERE expires_at < NOW() - INTERVAL '7 days' OR revoked_at < NOW() - INTERVAL '7 days'`,
        );
        await database.query(
            `DELETE FROM account_tokens
             WHERE expires_at < NOW() - INTERVAL '7 days' OR consumed_at < NOW() - INTERVAL '7 days'`,
        );
    }
}

export const filesRepository = new FilesRepository();
