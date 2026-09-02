import type { AuthenticationContext } from "../repositories/auth.repository.js";
import { auditRepository, type AuditLog } from "../repositories/audit.repository.js";
import type { AuditExportQuery, AuditListQuery } from "../schemas/audit.schemas.js";
import { exportTable, type ExportArtifact, type ExportColumn } from "../utils/tabular-export.js";

const maximumExportRows = 10_000;

const auditColumns: ExportColumn<AuditLog>[] = [
    { label: "Data", value: (row) => row.createdAt },
    { label: "Evento", value: (row) => row.event },
    { label: "Responsável", value: (row) => row.actorName },
    { label: "Usuário responsável", value: (row) => row.actorUserId },
    { label: "Tipo de entidade", value: (row) => row.entityType },
    { label: "Entidade", value: (row) => row.entityId },
    { label: "Requisição", value: (row) => row.requestId },
    { label: "Contexto", value: (row) => row.context },
];

export class AuditService {
    list(context: AuthenticationContext, query: AuditListQuery) {
        return auditRepository.list(context.companyId, query);
    }

    async export(
        context: AuthenticationContext,
        query: AuditExportQuery,
    ): Promise<ExportArtifact> {
        const logs = await auditRepository.export(context.companyId, query, maximumExportRows);
        return exportTable(query.format, "Auditoria RHumi", auditColumns, logs);
    }
}

export const auditService = new AuditService();
