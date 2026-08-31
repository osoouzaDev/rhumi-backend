import { randomUUID } from "node:crypto";
import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    applicationsRepository,
    type JobApplication,
} from "../repositories/applications.repository.js";
import {
    candidatesRepository,
    type Candidate,
} from "../repositories/candidates.repository.js";
import {
    organizationRepository,
    type AuditActor,
    type PaginatedResult,
} from "../repositories/organization.repository.js";
import {
    vacanciesRepository,
    type Vacancy,
} from "../repositories/vacancies.repository.js";
import type {
    ApplicationListQuery,
    CandidateListQuery,
    CreateApplicationInput,
    CreateCandidateInput,
    CreateVacancyInput,
    UpdateApplicationInput,
    UpdateCandidateInput,
    UpdateVacancyInput,
    VacancyListQuery,
} from "../schemas/recruitment.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const vacancyNotFound = () => new AppError(404, "VACANCY_NOT_FOUND", "Vaga não encontrada.");
const candidateNotFound = () => new AppError(404, "CANDIDATE_NOT_FOUND", "Candidato não encontrado.");
const applicationNotFound = () => new AppError(404, "APPLICATION_NOT_FOUND", "Candidatura não encontrada.");

const slugify = (value: string): string => value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 190);

const vacancyConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(error, "vacancies_slug_per_company_unique")) {
        throw new AppError(409, "VACANCY_SLUG_ALREADY_EXISTS", "Já existe uma vaga com este slug.");
    }
    throw error;
};

const candidateConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(error, "candidates_email_per_company_unique")) {
        throw new AppError(
            409,
            "CANDIDATE_EMAIL_ALREADY_EXISTS",
            "Já existe um candidato com este e-mail na empresa.",
        );
    }
    throw error;
};

const applicationConflict = (error: unknown): never => {
    if (hasDatabaseConstraint(error, "job_applications_candidate_vacancy_unique")) {
        throw new AppError(
            409,
            "APPLICATION_ALREADY_EXISTS",
            "O candidato já está inscrito nesta vaga.",
        );
    }
    throw error;
};

export class RecruitmentService {
    listVacancies(
        context: AuthenticationContext,
        query: VacancyListQuery,
    ): Promise<PaginatedResult<Vacancy>> {
        return vacanciesRepository.list(context.companyId, query);
    }

    async getVacancy(context: AuthenticationContext, vacancyId: string): Promise<Vacancy> {
        const vacancy = await vacanciesRepository.findById(context.companyId, vacancyId);
        if (!vacancy) {
            throw vacancyNotFound();
        }
        return vacancy;
    }

    async createVacancy(
        context: AuthenticationContext,
        input: CreateVacancyInput,
        actor: AuditActor,
    ): Promise<Vacancy> {
        await this.assertOrganizationAssignment(
            context.companyId,
            input.departmentId,
            input.positionId,
        );
        const baseSlug = input.slug ?? (slugify(input.title) || "vaga");
        const slug = input.slug
            ? input.slug
            : `${baseSlug}-${randomUUID().slice(0, 8)}`;
        const publishedAt = input.status === "open" && !input.publishedAt
            ? new Date().toISOString()
            : input.publishedAt;

        try {
            return await vacanciesRepository.create(
                context.companyId,
                { ...input, slug, publishedAt },
                actor,
            );
        } catch (error) {
            return vacancyConflict(error);
        }
    }

    async updateVacancy(
        context: AuthenticationContext,
        vacancyId: string,
        input: UpdateVacancyInput,
        actor: AuditActor,
    ): Promise<Vacancy> {
        const current = await this.getVacancy(context, vacancyId);
        const departmentId = input.departmentId ?? current.departmentId;
        const positionId = input.positionId ?? current.positionId;
        if (input.departmentId !== undefined || input.positionId !== undefined) {
            await this.assertOrganizationAssignment(context.companyId, departmentId, positionId);
        }
        if (input.slug && await vacanciesRepository.slugExists(
            context.companyId,
            input.slug,
            vacancyId,
        )) {
            throw new AppError(409, "VACANCY_SLUG_ALREADY_EXISTS", "Já existe uma vaga com este slug.");
        }

        const salaryMin = input.salaryMin === undefined ? current.salaryMin : input.salaryMin;
        const salaryMax = input.salaryMax === undefined ? current.salaryMax : input.salaryMax;
        if (salaryMin !== null && salaryMax !== null && salaryMax < salaryMin) {
            throw new AppError(
                422,
                "INVALID_VACANCY_SALARY_RANGE",
                "O salário máximo deve ser maior ou igual ao mínimo.",
            );
        }
        const publishedAt = input.publishedAt === undefined
            ? current.publishedAt?.toISOString() ?? null
            : input.publishedAt;
        const closesAt = input.closesAt === undefined
            ? current.closesAt?.toISOString() ?? null
            : input.closesAt;
        if (publishedAt && closesAt && closesAt < publishedAt) {
            throw new AppError(
                422,
                "INVALID_VACANCY_PUBLICATION_RANGE",
                "O encerramento não pode ser anterior à publicação.",
            );
        }

        const normalizedInput = {
            ...input,
            ...(input.status === "open" && current.status !== "open" && input.publishedAt === undefined
                ? { publishedAt: new Date().toISOString() }
                : {}),
        };
        try {
            const vacancy = await vacanciesRepository.update(
                context.companyId,
                vacancyId,
                normalizedInput,
                actor,
            );
            if (!vacancy) {
                throw vacancyNotFound();
            }
            return vacancy;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            return vacancyConflict(error);
        }
    }

    async archiveVacancy(
        context: AuthenticationContext,
        vacancyId: string,
        actor: AuditActor,
    ): Promise<void> {
        await this.getVacancy(context, vacancyId);
        const activeApplications = await vacanciesRepository.countActiveApplications(
            context.companyId,
            vacancyId,
        );
        if (activeApplications > 0) {
            throw new AppError(
                409,
                "VACANCY_HAS_ACTIVE_APPLICATIONS",
                "A vaga possui candidaturas ativas. Encerre ou retire as candidaturas antes de excluí-la.",
                { activeApplications },
            );
        }
        if (!await vacanciesRepository.archive(context.companyId, vacancyId, actor)) {
            throw vacancyNotFound();
        }
    }

    listCandidates(
        context: AuthenticationContext,
        query: CandidateListQuery,
    ): Promise<PaginatedResult<Candidate>> {
        return candidatesRepository.list(context.companyId, query);
    }

    async getCandidate(context: AuthenticationContext, candidateId: string): Promise<{
        candidate: Candidate;
        applications: JobApplication[];
    }> {
        const candidate = await candidatesRepository.findById(context.companyId, candidateId);
        if (!candidate) {
            throw candidateNotFound();
        }
        const applications = await applicationsRepository.list(context.companyId, {
            page: 1,
            pageSize: 100,
            candidateId,
        });
        return { candidate, applications: applications.items };
    }

    async createCandidate(
        context: AuthenticationContext,
        input: CreateCandidateInput,
        actor: AuditActor,
    ): Promise<Candidate> {
        try {
            return await candidatesRepository.create(context.companyId, input, actor);
        } catch (error) {
            return candidateConflict(error);
        }
    }

    async updateCandidate(
        context: AuthenticationContext,
        candidateId: string,
        input: UpdateCandidateInput,
        actor: AuditActor,
    ): Promise<Candidate> {
        await this.getCandidate(context, candidateId);
        try {
            const candidate = await candidatesRepository.update(
                context.companyId,
                candidateId,
                input,
                actor,
            );
            if (!candidate) {
                throw candidateNotFound();
            }
            return candidate;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            return candidateConflict(error);
        }
    }

    async archiveCandidate(
        context: AuthenticationContext,
        candidateId: string,
        actor: AuditActor,
    ): Promise<void> {
        await this.getCandidate(context, candidateId);
        const activeApplications = await candidatesRepository.countActiveApplications(
            context.companyId,
            candidateId,
        );
        if (activeApplications > 0) {
            throw new AppError(
                409,
                "CANDIDATE_HAS_ACTIVE_APPLICATIONS",
                "O candidato possui candidaturas ativas.",
                { activeApplications },
            );
        }
        if (!await candidatesRepository.archive(context.companyId, candidateId, actor)) {
            throw candidateNotFound();
        }
    }

    listApplications(
        context: AuthenticationContext,
        query: ApplicationListQuery,
    ): Promise<PaginatedResult<JobApplication>> {
        return applicationsRepository.list(context.companyId, query);
    }

    async getApplication(context: AuthenticationContext, applicationId: string): Promise<{
        application: JobApplication;
        history: Awaited<ReturnType<typeof applicationsRepository.getHistory>>;
    }> {
        const application = await applicationsRepository.findById(
            context.companyId,
            applicationId,
        );
        if (!application) {
            throw applicationNotFound();
        }
        const history = await applicationsRepository.getHistory(context.companyId, applicationId);
        return { application, history };
    }

    async createApplication(
        context: AuthenticationContext,
        vacancyId: string,
        input: CreateApplicationInput,
        actor: AuditActor,
    ): Promise<JobApplication> {
        const [vacancy, candidate] = await Promise.all([
            vacanciesRepository.findById(context.companyId, vacancyId),
            candidatesRepository.findById(context.companyId, input.candidateId),
        ]);
        if (!vacancy) {
            throw vacancyNotFound();
        }
        if (!candidate) {
            throw candidateNotFound();
        }
        if (vacancy.status !== "open") {
            throw new AppError(
                409,
                "VACANCY_NOT_OPEN",
                "A vaga precisa estar aberta para receber candidaturas.",
            );
        }
        try {
            return await applicationsRepository.create(
                context.companyId,
                vacancyId,
                input,
                actor,
            );
        } catch (error) {
            return applicationConflict(error);
        }
    }

    async updateApplication(
        context: AuthenticationContext,
        applicationId: string,
        input: UpdateApplicationInput,
        actor: AuditActor,
    ): Promise<JobApplication> {
        const current = await applicationsRepository.findById(context.companyId, applicationId);
        if (!current) {
            throw applicationNotFound();
        }
        if (input.stageNotes && !input.stage) {
            throw new AppError(
                422,
                "STAGE_NOTES_REQUIRE_STAGE",
                "Observações de etapa exigem uma nova etapa.",
            );
        }
        if (current.stage === "hired" && input.stage && input.stage !== "hired") {
            throw new AppError(
                409,
                "HIRED_APPLICATION_IS_FINAL",
                "Uma candidatura contratada não pode retornar a outra etapa.",
            );
        }
        const application = await applicationsRepository.update(
            context.companyId,
            applicationId,
            input,
            actor,
        );
        if (!application) {
            throw applicationNotFound();
        }
        return application;
    }

    async withdrawApplication(
        context: AuthenticationContext,
        applicationId: string,
        actor: AuditActor,
    ): Promise<void> {
        const current = await applicationsRepository.findById(context.companyId, applicationId);
        if (!current) {
            throw applicationNotFound();
        }
        if (current.stage === "hired") {
            throw new AppError(
                409,
                "HIRED_APPLICATION_CANNOT_BE_WITHDRAWN",
                "Uma candidatura contratada não pode ser retirada.",
            );
        }
        if (!await applicationsRepository.withdraw(context.companyId, applicationId, actor)) {
            throw applicationNotFound();
        }
    }

    async getBoard(context: AuthenticationContext, vacancyId: string) {
        const vacancy = await this.getVacancy(context, vacancyId);
        const applications = await applicationsRepository.listForBoard(
            context.companyId,
            vacancyId,
        );
        const stages: JobApplication["stage"][] = [
            "applied", "screening", "interview", "assessment", "offer", "hired", "rejected",
        ];
        return {
            vacancy,
            columns: stages.map((stage) => ({
                stage,
                total: applications.filter((application) => application.stage === stage).length,
                applications: applications.filter((application) => application.stage === stage),
            })),
        };
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
        if (!department || !position) {
            throw new AppError(
                422,
                "INVALID_VACANCY_ASSIGNMENT",
                "O departamento ou cargo informado não existe.",
            );
        }
        if (!department.active || !position.active) {
            throw new AppError(
                409,
                "INACTIVE_VACANCY_ASSIGNMENT",
                "O departamento e o cargo da vaga precisam estar ativos.",
            );
        }
        if (position.departmentId !== departmentId) {
            throw new AppError(
                422,
                "VACANCY_POSITION_DEPARTMENT_MISMATCH",
                "O cargo não pertence ao departamento selecionado.",
            );
        }
    }
}

export const recruitmentService = new RecruitmentService();
