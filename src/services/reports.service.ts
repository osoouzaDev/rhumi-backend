import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    reportsRepository,
    type EmployeeReportRow,
} from "../repositories/reports.repository.js";
import type { ReportExportQuery } from "../schemas/audit.schemas.js";
import { exportTable, type ExportArtifact, type ExportColumn } from "../utils/tabular-export.js";

const maximumExportRows = 10_000;

const employeeColumns: ExportColumn<EmployeeReportRow>[] = [
    { label: "Matrícula", value: (row) => row.employeeCode },
    { label: "Nome", value: (row) => row.fullName },
    { label: "E-mail", value: (row) => row.email },
    { label: "Departamento", value: (row) => row.department },
    { label: "Cargo", value: (row) => row.position },
    { label: "Contrato", value: (row) => row.contractType },
    { label: "Situação", value: (row) => row.status },
    { label: "Admissão", value: (row) => row.admissionDate },
    { label: "Desligamento", value: (row) => row.terminationDate },
    { label: "Conta", value: (row) => row.accountStatus },
];

export class ReportsService {
    async employees(
        context: AuthenticationContext,
        query: ReportExportQuery,
    ): Promise<ExportArtifact> {
        const rows = await reportsRepository.employees(
            context.companyId,
            query,
            maximumExportRows,
        );
        return exportTable(query.format, "Colaboradores RHumi", employeeColumns, rows);
    }
}

export const reportsService = new ReportsService();
