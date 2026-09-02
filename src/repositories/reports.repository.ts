import database from "../database/connection.js";
import type { ReportExportQuery } from "../schemas/audit.schemas.js";

export interface EmployeeReportRow {
    employeeCode: string;
    fullName: string;
    email: string;
    department: string;
    position: string;
    contractType: string;
    status: string;
    admissionDate: string;
    terminationDate: string | null;
    accountStatus: string | null;
}

interface DatabaseEmployeeReportRow {
    employee_code: string;
    full_name: string;
    email: string;
    department: string;
    position: string;
    contract_type: string;
    status: string;
    admission_date: string;
    termination_date: string | null;
    account_status: string | null;
}

export class ReportsRepository {
    async employees(
        companyId: string,
        query: ReportExportQuery,
        maximumRows: number,
    ): Promise<EmployeeReportRow[]> {
        const values: unknown[] = [companyId];
        const conditions = [
            "employees.company_id = $1",
            "employees.deleted_at IS NULL",
        ];
        if (query.status) {
            values.push(query.status);
            conditions.push(`employees.status = $${values.length}`);
        }
        values.push(maximumRows);
        const result = await database.query<DatabaseEmployeeReportRow>(
            `SELECT employees.employee_code, employees.full_name, employees.email,
                    departments.name AS department, positions.title AS position,
                    employees.contract_type::TEXT, employees.status::TEXT,
                    employees.admission_date::TEXT, employees.termination_date::TEXT,
                    users.status::TEXT AS account_status
             FROM employees
             INNER JOIN departments ON departments.id = employees.department_id
             INNER JOIN positions ON positions.id = employees.position_id
             LEFT JOIN users ON users.employee_id = employees.id AND users.deleted_at IS NULL
             WHERE ${conditions.join(" AND ")}
             ORDER BY employees.full_name, employees.id
             LIMIT $${values.length}`,
            values,
        );
        return result.rows.map((row) => ({
            employeeCode: row.employee_code,
            fullName: row.full_name,
            email: row.email,
            department: row.department,
            position: row.position,
            contractType: row.contract_type,
            status: row.status,
            admissionDate: row.admission_date,
            terminationDate: row.termination_date,
            accountStatus: row.account_status,
        }));
    }
}

export const reportsRepository = new ReportsRepository();
