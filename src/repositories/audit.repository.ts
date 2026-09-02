import database from "../database/connection.js";
import type { AuditExportQuery, AuditListQuery } from "../schemas/audit.schemas.js";
import type { PaginatedResult } from "./organization.repository.js";

export interface AuditLog {
    id: number;
    companyId: string | null;
    actorUserId: string | null;
    actorName: string | null;
    event: string;
    entityType: string | null;
    entityId: string | null;
    requestId: string | null;
    context: Record<string, unknown>;
    createdAt: Date;
}

interface AuditLogRow {
    id: number;
    company_id: string | null;
    actor_user_id: string | null;
    actor_name: string | null;
    event: string;
    entity_type: string | null;
    entity_id: string | null;
    request_id: string | null;
    context: Record<string, unknown>;
    created_at: Date;
    total?: number;
}

type AuditFilters = Pick<
    AuditListQuery,
    "event" | "entityType" | "actorUserId" | "from" | "to"
>;

const mapAuditLog = (row: AuditLogRow): AuditLog => ({
    id: row.id,
    companyId: row.company_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    event: row.event,
    entityType: row.entity_type,
    entityId: row.entity_id,
    requestId: row.request_id,
    context: row.context,
    createdAt: row.created_at,
});

const buildFilters = (companyId: string, query: AuditFilters) => {
    const values: unknown[] = [companyId];
    const conditions = ["audit_logs.company_id = $1"];
    if (query.event) {
        values.push(query.event);
        conditions.push(`audit_logs.event = $${values.length}`);
    }
    if (query.entityType) {
        values.push(query.entityType);
        conditions.push(`audit_logs.entity_type = $${values.length}`);
    }
    if (query.actorUserId) {
        values.push(query.actorUserId);
        conditions.push(`audit_logs.actor_user_id = $${values.length}`);
    }
    if (query.from) {
        values.push(query.from);
        conditions.push(`audit_logs.created_at >= $${values.length}::TIMESTAMPTZ`);
    }
    if (query.to) {
        values.push(query.to);
        conditions.push(`audit_logs.created_at <= $${values.length}::TIMESTAMPTZ`);
    }
    return { values, conditions };
};

const selectAuditLogs = `
    SELECT audit_logs.id, audit_logs.company_id, audit_logs.actor_user_id,
           employees.full_name AS actor_name, audit_logs.event,
           audit_logs.entity_type, audit_logs.entity_id, audit_logs.request_id,
           audit_logs.context, audit_logs.created_at,
           COUNT(*) OVER()::INTEGER AS total
    FROM audit_logs
    LEFT JOIN users ON users.id = audit_logs.actor_user_id
    LEFT JOIN employees ON employees.id = users.employee_id
`;

export class AuditRepository {
    async list(
        companyId: string,
        query: AuditListQuery,
    ): Promise<PaginatedResult<AuditLog>> {
        const { values, conditions } = buildFilters(companyId, query);
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<AuditLogRow>(
            `${selectAuditLogs}
             WHERE ${conditions.join(" AND ")}
             ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return {
            items: result.rows.map(mapAuditLog),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async export(
        companyId: string,
        query: AuditExportQuery,
        maximumRows: number,
    ): Promise<AuditLog[]> {
        const { values, conditions } = buildFilters(companyId, query);
        values.push(maximumRows);
        const result = await database.query<AuditLogRow>(
            `${selectAuditLogs}
             WHERE ${conditions.join(" AND ")}
             ORDER BY audit_logs.created_at DESC, audit_logs.id DESC
             LIMIT $${values.length}`,
            values,
        );
        return result.rows.map(mapAuditLog);
    }
}

export const auditRepository = new AuditRepository();
