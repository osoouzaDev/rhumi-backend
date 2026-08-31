import { AppError } from "../errors/app-error.js";
import {
    organizationRepository,
    type AuditActor,
    type Company,
    type Department,
    type PaginatedResult,
    type Position,
} from "../repositories/organization.repository.js";
import type {
    CreateDepartmentInput,
    CreatePositionInput,
    DepartmentListQuery,
    PositionListQuery,
    UpdateCompanyInput,
    UpdateDepartmentInput,
    UpdatePositionInput,
} from "../schemas/organization.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const companyNotFound = (): AppError => new AppError(
    404,
    "COMPANY_NOT_FOUND",
    "Empresa não encontrada.",
);

const departmentNotFound = (): AppError => new AppError(
    404,
    "DEPARTMENT_NOT_FOUND",
    "Departamento não encontrado.",
);

const positionNotFound = (): AppError => new AppError(
    404,
    "POSITION_NOT_FOUND",
    "Cargo não encontrado.",
);

const handleCompanyConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(error, "companies_tax_id_unique")) {
        throw new AppError(409, "COMPANY_TAX_ID_ALREADY_EXISTS", "Já existe uma empresa com este documento.");
    }
    if (hasDatabaseConstraint(error, "companies_careers_slug_unique")) {
        throw new AppError(409, "CAREERS_SLUG_ALREADY_EXISTS", "Este endereço da página de carreiras já está em uso.");
    }
    throw error;
};

const handleDepartmentConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(
        error,
        "departments_name_per_company_unique",
        "departments_acronym_per_company_unique",
    )) {
        throw new AppError(
            409,
            "DEPARTMENT_ALREADY_EXISTS",
            "Já existe um departamento com este nome ou sigla.",
        );
    }
    throw error;
};

const handlePositionConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(error, "positions_title_per_department_unique")) {
        throw new AppError(
            409,
            "POSITION_ALREADY_EXISTS",
            "Já existe um cargo com este nome no departamento.",
        );
    }
    throw error;
};

export class OrganizationService {
    async getCompany(companyId: string): Promise<Company> {
        const company = await organizationRepository.findCompany(companyId);
        if (!company) {
            throw companyNotFound();
        }
        return company;
    }

    async updateCompany(
        companyId: string,
        input: UpdateCompanyInput,
        actor: AuditActor,
    ): Promise<Company> {
        try {
            const company = await organizationRepository.updateCompany(companyId, input, actor);
            if (!company) {
                throw companyNotFound();
            }
            return company;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            return handleCompanyConflict(error);
        }
    }

    listDepartments(
        companyId: string,
        query: DepartmentListQuery,
    ): Promise<PaginatedResult<Department>> {
        return organizationRepository.listDepartments(companyId, query);
    }

    async getDepartment(companyId: string, departmentId: string): Promise<Department> {
        const department = await organizationRepository.findDepartment(companyId, departmentId);
        if (!department) {
            throw departmentNotFound();
        }
        return department;
    }

    async createDepartment(
        companyId: string,
        input: CreateDepartmentInput,
        actor: AuditActor,
    ): Promise<Department> {
        try {
            return await organizationRepository.createDepartment(companyId, input, actor);
        } catch (error) {
            return handleDepartmentConflict(error);
        }
    }

    async updateDepartment(
        companyId: string,
        departmentId: string,
        input: UpdateDepartmentInput,
        actor: AuditActor,
    ): Promise<Department> {
        await this.getDepartment(companyId, departmentId);
        if (input.active === false) {
            await this.assertDepartmentIsUnused(companyId, departmentId);
        }

        try {
            const department = await organizationRepository.updateDepartment(
                companyId,
                departmentId,
                input,
                actor,
            );
            if (!department) {
                throw departmentNotFound();
            }
            return department;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            return handleDepartmentConflict(error);
        }
    }

    async archiveDepartment(
        companyId: string,
        departmentId: string,
        actor: AuditActor,
    ): Promise<void> {
        await this.getDepartment(companyId, departmentId);
        await this.assertDepartmentIsUnused(companyId, departmentId);
        const archived = await organizationRepository.archiveDepartment(companyId, departmentId, actor);
        if (!archived) {
            throw departmentNotFound();
        }
    }

    listPositions(
        companyId: string,
        query: PositionListQuery,
    ): Promise<PaginatedResult<Position>> {
        return organizationRepository.listPositions(companyId, query);
    }

    async getPosition(companyId: string, positionId: string): Promise<Position> {
        const position = await organizationRepository.findPosition(companyId, positionId);
        if (!position) {
            throw positionNotFound();
        }
        return position;
    }

    async createPosition(
        companyId: string,
        input: CreatePositionInput,
        actor: AuditActor,
    ): Promise<Position> {
        await this.assertActiveDepartment(companyId, input.departmentId);
        try {
            return await organizationRepository.createPosition(companyId, input, actor);
        } catch (error) {
            return handlePositionConflict(error);
        }
    }

    async updatePosition(
        companyId: string,
        positionId: string,
        input: UpdatePositionInput,
        actor: AuditActor,
    ): Promise<Position> {
        await this.getPosition(companyId, positionId);
        if (input.departmentId) {
            await this.assertActiveDepartment(companyId, input.departmentId);
        }
        if (input.active === false) {
            await this.assertPositionIsUnused(companyId, positionId);
        }

        try {
            const position = await organizationRepository.updatePosition(
                companyId,
                positionId,
                input,
                actor,
            );
            if (!position) {
                throw positionNotFound();
            }
            return position;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            return handlePositionConflict(error);
        }
    }

    async archivePosition(
        companyId: string,
        positionId: string,
        actor: AuditActor,
    ): Promise<void> {
        await this.getPosition(companyId, positionId);
        await this.assertPositionIsUnused(companyId, positionId);
        const archived = await organizationRepository.archivePosition(companyId, positionId, actor);
        if (!archived) {
            throw positionNotFound();
        }
    }

    private async assertActiveDepartment(companyId: string, departmentId: string): Promise<void> {
        const department = await this.getDepartment(companyId, departmentId);
        if (!department.active) {
            throw new AppError(
                409,
                "DEPARTMENT_INACTIVE",
                "O departamento informado está inativo.",
            );
        }
    }

    private async assertDepartmentIsUnused(companyId: string, departmentId: string): Promise<void> {
        const usage = await organizationRepository.getDepartmentUsage(companyId, departmentId);
        if (usage.positions > 0 || usage.employees > 0) {
            throw new AppError(
                409,
                "DEPARTMENT_IN_USE",
                "O departamento possui cargos ou colaboradores vinculados.",
                usage,
            );
        }
    }

    private async assertPositionIsUnused(companyId: string, positionId: string): Promise<void> {
        const links = await organizationRepository.getPositionUsage(companyId, positionId);
        if (links > 0) {
            throw new AppError(
                409,
                "POSITION_IN_USE",
                "O cargo possui colaboradores ou vagas ativas vinculados.",
                { links },
            );
        }
    }
}

export const organizationService = new OrganizationService();
