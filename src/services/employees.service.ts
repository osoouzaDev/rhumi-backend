import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    employeesRepository,
    type Employee,
} from "../repositories/employees.repository.js";
import {
    organizationRepository,
    type AuditActor,
    type PaginatedResult,
} from "../repositories/organization.repository.js";
import type {
    CreateEmployeeInput,
    EmployeeListQuery,
    UpdateEmployeeInput,
} from "../schemas/employees.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const employeeNotFound = (): AppError => new AppError(
    404,
    "EMPLOYEE_NOT_FOUND",
    "Colaborador não encontrado.",
);

const supervisorDepartmentScope = (context: AuthenticationContext): string | undefined => (
    context.roles.includes("supervisor") && !context.roles.includes("administrator")
        ? context.departmentId
        : undefined
);

const handleEmployeeConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(
        error,
        "employees_email_unique",
        "employees_email_per_company_unique",
    )) {
        throw new AppError(
            409,
            "EMPLOYEE_EMAIL_ALREADY_EXISTS",
            "Já existe um colaborador com este e-mail.",
        );
    }
    if (hasDatabaseConstraint(
        error,
        "employees_code_unique",
        "employees_code_per_company_unique",
    )) {
        throw new AppError(
            409,
            "EMPLOYEE_CODE_ALREADY_EXISTS",
            "Já existe um colaborador com este código.",
        );
    }
    throw error;
};

export class EmployeesService {
    list(
        context: AuthenticationContext,
        query: EmployeeListQuery,
    ): Promise<PaginatedResult<Employee>> {
        const scopeDepartmentId = supervisorDepartmentScope(context);
        if (scopeDepartmentId && query.departmentId && query.departmentId !== scopeDepartmentId) {
            throw new AppError(
                403,
                "DEPARTMENT_SCOPE_VIOLATION",
                "Supervisores só podem consultar colaboradores do próprio departamento.",
            );
        }
        return employeesRepository.list(context.companyId, query, scopeDepartmentId);
    }

    async getById(context: AuthenticationContext, employeeId: string): Promise<Employee> {
        const employee = await employeesRepository.findById(
            context.companyId,
            employeeId,
            supervisorDepartmentScope(context),
        );
        if (!employee) {
            throw employeeNotFound();
        }
        return employee;
    }

    async getOwnProfile(context: AuthenticationContext): Promise<Employee> {
        const employee = await employeesRepository.findById(
            context.companyId,
            context.employeeId,
        );
        if (!employee) {
            throw employeeNotFound();
        }
        return employee;
    }

    async create(
        context: AuthenticationContext,
        input: CreateEmployeeInput,
        actor: AuditActor,
    ): Promise<Employee> {
        await this.assertOrganizationAssignment(
            context.companyId,
            input.departmentId,
            input.positionId,
        );
        this.assertEmploymentDates(input.admissionDate, input.terminationDate ?? null);

        try {
            return await employeesRepository.create(context.companyId, input, actor);
        } catch (error) {
            return handleEmployeeConflict(error);
        }
    }

    async update(
        context: AuthenticationContext,
        employeeId: string,
        input: UpdateEmployeeInput,
        actor: AuditActor,
    ): Promise<Employee> {
        const scopeDepartmentId = supervisorDepartmentScope(context);
        const current = await employeesRepository.findById(
            context.companyId,
            employeeId,
            scopeDepartmentId,
        );
        if (!current) {
            throw employeeNotFound();
        }

        const departmentId = input.departmentId ?? current.departmentId;
        const positionId = input.positionId ?? current.positionId;
        if (scopeDepartmentId && departmentId !== scopeDepartmentId) {
            throw new AppError(
                403,
                "DEPARTMENT_SCOPE_VIOLATION",
                "Supervisores não podem transferir colaboradores para outro departamento.",
            );
        }

        if (input.departmentId !== undefined || input.positionId !== undefined) {
            await this.assertOrganizationAssignment(context.companyId, departmentId, positionId);
        }
        this.assertEmploymentDates(
            input.admissionDate ?? current.admissionDate,
            input.terminationDate === undefined ? current.terminationDate : input.terminationDate,
        );

        try {
            const employee = await employeesRepository.update(
                context.companyId,
                employeeId,
                input,
                actor,
                scopeDepartmentId,
            );
            if (!employee) {
                throw employeeNotFound();
            }
            return employee;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            return handleEmployeeConflict(error);
        }
    }

    async archive(
        context: AuthenticationContext,
        employeeId: string,
        actor: AuditActor,
    ): Promise<void> {
        if (employeeId === context.employeeId) {
            throw new AppError(
                409,
                "CANNOT_ARCHIVE_OWN_EMPLOYEE",
                "Você não pode excluir o próprio cadastro de colaborador.",
            );
        }

        const archived = await employeesRepository.archive(
            context.companyId,
            employeeId,
            actor,
            supervisorDepartmentScope(context),
        );
        if (!archived) {
            throw employeeNotFound();
        }
    }

    private async assertOrganizationAssignment(
        companyId: string,
        departmentId: string,
        positionId: string,
    ): Promise<void> {
        const [department, position] = await Promise.all([
            organizationRepository.findDepartment(companyId, departmentId),
            organizationRepository.findPosition(companyId, positionId),
        ]);

        if (!department) {
            throw new AppError(422, "INVALID_DEPARTMENT", "O departamento informado não existe.");
        }
        if (!position) {
            throw new AppError(422, "INVALID_POSITION", "O cargo informado não existe.");
        }
        if (!department.active || !position.active) {
            throw new AppError(
                409,
                "INACTIVE_ORGANIZATION_ASSIGNMENT",
                "O departamento e o cargo precisam estar ativos.",
            );
        }
        if (position.departmentId !== departmentId) {
            throw new AppError(
                422,
                "POSITION_DEPARTMENT_MISMATCH",
                "O cargo informado não pertence ao departamento selecionado.",
            );
        }
    }

    private assertEmploymentDates(admissionDate: string, terminationDate: string | null): void {
        if (terminationDate && terminationDate < admissionDate) {
            throw new AppError(
                422,
                "INVALID_EMPLOYMENT_DATES",
                "A data de desligamento não pode ser anterior à admissão.",
            );
        }
    }
}

export const employeesService = new EmployeesService();
