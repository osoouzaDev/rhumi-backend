import database from "../database/connection.js";

export interface EmployeeMetrics {
    total: number;
    active: number;
    onLeave: number;
    inactive: number;
    admittedLast30Days: number;
}

export interface OrganizationMetrics {
    activeDepartments: number;
    activePositions: number;
}

export interface AccountMetrics {
    active: number;
    blocked: number;
    inactive: number;
    withoutAccount: number;
}

export interface DepartmentHeadcount {
    departmentId: string;
    departmentName: string;
    total: number;
    active: number;
    onLeave: number;
    inactive: number;
    percentage: number;
}

export interface ContractDistribution {
    contractType: "clt" | "pj";
    total: number;
    percentage: number;
}

export interface RecentHire {
    employeeId: string;
    employeeCode: string;
    fullName: string;
    email: string;
    departmentName: string;
    positionTitle: string;
    contractType: "clt" | "pj";
    admissionDate: string;
}

export interface DashboardData {
    employees: EmployeeMetrics;
    organization: OrganizationMetrics;
    accounts: AccountMetrics;
    headcountByDepartment: DepartmentHeadcount[];
    contractDistribution: ContractDistribution[];
    recentHires: RecentHire[];
}

interface EmployeeMetricsRow {
    total: number;
    active: number;
    on_leave: number;
    inactive: number;
    admitted_last_30_days: number;
}

interface OrganizationMetricsRow {
    active_departments: number;
    active_positions: number;
}

interface AccountMetricsRow {
    active: number;
    blocked: number;
    inactive: number;
    without_account: number;
}

interface DepartmentHeadcountRow {
    department_id: string;
    department_name: string;
    total: number;
    active: number;
    on_leave: number;
    inactive: number;
}

interface ContractDistributionRow {
    contract_type: "clt" | "pj";
    total: number;
}

interface RecentHireRow {
    employee_id: string;
    employee_code: string;
    full_name: string;
    email: string;
    department_name: string;
    position_title: string;
    contract_type: "clt" | "pj";
    admission_date: string;
}

const percentage = (value: number, total: number): number => (
    total === 0 ? 0 : Number(((value / total) * 100).toFixed(1))
);

export class DashboardRepository {
    async getDashboard(
        companyId: string,
        scopeDepartmentId?: string,
    ): Promise<DashboardData> {
        const parameters = [companyId, scopeDepartmentId ?? null];
        const [
            employeeResult,
            organizationResult,
            accountResult,
            departmentResult,
            contractResult,
            recentHiresResult,
        ] = await Promise.all([
            database.query<EmployeeMetricsRow>(
                `SELECT
                    COUNT(*)::INTEGER AS total,
                    COUNT(*) FILTER (WHERE status = 'active')::INTEGER AS active,
                    COUNT(*) FILTER (WHERE status = 'on_leave')::INTEGER AS on_leave,
                    COUNT(*) FILTER (WHERE status = 'inactive')::INTEGER AS inactive,
                    COUNT(*) FILTER (
                        WHERE admission_date >= CURRENT_DATE - INTERVAL '30 days'
                    )::INTEGER AS admitted_last_30_days
                 FROM employees
                 WHERE company_id = $1
                   AND deleted_at IS NULL
                   AND ($2::UUID IS NULL OR department_id = $2)`,
                parameters,
            ),
            database.query<OrganizationMetricsRow>(
                `SELECT
                    (SELECT COUNT(*)::INTEGER
                     FROM departments
                     WHERE company_id = $1 AND deleted_at IS NULL AND active = TRUE
                       AND ($2::UUID IS NULL OR id = $2)) AS active_departments,
                    (SELECT COUNT(*)::INTEGER
                     FROM positions
                     WHERE company_id = $1 AND deleted_at IS NULL AND active = TRUE
                       AND ($2::UUID IS NULL OR department_id = $2)) AS active_positions`,
                parameters,
            ),
            database.query<AccountMetricsRow>(
                `SELECT
                    COUNT(users.id) FILTER (WHERE users.status = 'active')::INTEGER AS active,
                    COUNT(users.id) FILTER (WHERE users.status = 'blocked')::INTEGER AS blocked,
                    COUNT(users.id) FILTER (WHERE users.status = 'inactive')::INTEGER AS inactive,
                    COUNT(*) FILTER (
                        WHERE employees.status = 'active' AND users.id IS NULL
                    )::INTEGER AS without_account
                 FROM employees
                 LEFT JOIN users
                    ON users.employee_id = employees.id AND users.deleted_at IS NULL
                 WHERE employees.company_id = $1
                   AND employees.deleted_at IS NULL
                   AND ($2::UUID IS NULL OR employees.department_id = $2)`,
                parameters,
            ),
            database.query<DepartmentHeadcountRow>(
                `SELECT departments.id AS department_id,
                        departments.name AS department_name,
                        COUNT(employees.id)::INTEGER AS total,
                        COUNT(employees.id) FILTER (
                            WHERE employees.status = 'active'
                        )::INTEGER AS active,
                        COUNT(employees.id) FILTER (
                            WHERE employees.status = 'on_leave'
                        )::INTEGER AS on_leave,
                        COUNT(employees.id) FILTER (
                            WHERE employees.status = 'inactive'
                        )::INTEGER AS inactive
                 FROM departments
                 LEFT JOIN employees
                    ON employees.department_id = departments.id
                   AND employees.deleted_at IS NULL
                 WHERE departments.company_id = $1
                   AND departments.deleted_at IS NULL
                   AND ($2::UUID IS NULL OR departments.id = $2)
                 GROUP BY departments.id, departments.name
                 ORDER BY total DESC, departments.name ASC`,
                parameters,
            ),
            database.query<ContractDistributionRow>(
                `SELECT contract_type, COUNT(*)::INTEGER AS total
                 FROM employees
                 WHERE company_id = $1
                   AND deleted_at IS NULL
                   AND ($2::UUID IS NULL OR department_id = $2)
                 GROUP BY contract_type
                 ORDER BY contract_type`,
                parameters,
            ),
            database.query<RecentHireRow>(
                `SELECT employees.id AS employee_id, employees.employee_code,
                        employees.full_name, employees.email, departments.name AS department_name,
                        positions.title AS position_title, employees.contract_type,
                        employees.admission_date
                 FROM employees
                 INNER JOIN departments ON departments.id = employees.department_id
                 INNER JOIN positions ON positions.id = employees.position_id
                 WHERE employees.company_id = $1
                   AND employees.deleted_at IS NULL
                   AND ($2::UUID IS NULL OR employees.department_id = $2)
                 ORDER BY employees.admission_date DESC, employees.created_at DESC
                 LIMIT 5`,
                parameters,
            ),
        ]);

        const employees = employeeResult.rows[0];
        const organization = organizationResult.rows[0];
        const accounts = accountResult.rows[0];
        const totalEmployees = employees.total;

        return {
            employees: {
                total: employees.total,
                active: employees.active,
                onLeave: employees.on_leave,
                inactive: employees.inactive,
                admittedLast30Days: employees.admitted_last_30_days,
            },
            organization: {
                activeDepartments: organization.active_departments,
                activePositions: organization.active_positions,
            },
            accounts: {
                active: accounts.active,
                blocked: accounts.blocked,
                inactive: accounts.inactive,
                withoutAccount: accounts.without_account,
            },
            headcountByDepartment: departmentResult.rows.map((row) => ({
                departmentId: row.department_id,
                departmentName: row.department_name,
                total: row.total,
                active: row.active,
                onLeave: row.on_leave,
                inactive: row.inactive,
                percentage: percentage(row.total, totalEmployees),
            })),
            contractDistribution: contractResult.rows.map((row) => ({
                contractType: row.contract_type,
                total: row.total,
                percentage: percentage(row.total, totalEmployees),
            })),
            recentHires: recentHiresResult.rows.map((row) => ({
                employeeId: row.employee_id,
                employeeCode: row.employee_code,
                fullName: row.full_name,
                email: row.email,
                departmentName: row.department_name,
                positionTitle: row.position_title,
                contractType: row.contract_type,
                admissionDate: row.admission_date,
            })),
        };
    }
}

export const dashboardRepository = new DashboardRepository();
