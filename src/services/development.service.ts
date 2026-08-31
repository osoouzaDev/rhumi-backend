import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    careerRepository,
    type CareerProfile,
    type CareerTrack,
} from "../repositories/career.repository.js";
import {
    developmentPlansRepository,
    type DevelopmentAction,
    type DevelopmentPlan,
} from "../repositories/development-plans.repository.js";
import { employeesRepository, type Employee } from "../repositories/employees.repository.js";
import { evaluationAssignmentsRepository } from "../repositories/evaluation-assignments.repository.js";
import { organizationRepository, type AuditActor } from "../repositories/organization.repository.js";
import { trainingsRepository } from "../repositories/trainings.repository.js";
import type {
    CareerTrackListQuery,
    CreateCareerTrackInput,
    CreateDevelopmentPlanInput,
    DevelopmentPlanListQuery,
    MyDevelopmentPlanListQuery,
    UpdateCareerTrackInput,
    UpdateDevelopmentActionInput,
    UpdateDevelopmentPlanInput,
    UpdateMyDevelopmentActionInput,
    UpsertCareerProfileInput,
} from "../schemas/development.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const trackNotFound = (): AppError => new AppError(
    404, "CAREER_TRACK_NOT_FOUND", "Trilha de carreira não encontrada.",
);
const profileNotFound = (): AppError => new AppError(
    404, "CAREER_PROFILE_NOT_FOUND", "Perfil de carreira não encontrado.",
);
const planNotFound = (): AppError => new AppError(
    404, "DEVELOPMENT_PLAN_NOT_FOUND", "Plano de desenvolvimento não encontrado.",
);
const actionNotFound = (): AppError => new AppError(
    404, "DEVELOPMENT_ACTION_NOT_FOUND", "Ação de desenvolvimento não encontrada.",
);
const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);

export class DevelopmentService {
    listTracks(context: AuthenticationContext, query: CareerTrackListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return careerRepository.listTracks(
            context.companyId, isAdministrator(context) ? undefined : context.departmentId, query,
        );
    }

    async getTrack(context: AuthenticationContext, trackId: string): Promise<CareerTrack> {
        const track = await careerRepository.findTrack(
            context.companyId, trackId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!track) throw trackNotFound();
        return track;
    }

    async createTrack(
        context: AuthenticationContext, input: CreateCareerTrackInput, actor: AuditActor,
    ): Promise<CareerTrack> {
        const departmentId = await this.resolveDepartment(context, input.departmentId);
        await this.validateTrackLevels(context, input.levels, input.status, departmentId);
        try {
            const id = await careerRepository.createTrack(
                context.companyId, departmentId, input, actor,
            );
            return this.getTrack(context, id);
        } catch (error) {
            if (hasDatabaseConstraint(error, "career_tracks_code_per_company_unique")) {
                throw new AppError(409, "CAREER_TRACK_CODE_ALREADY_EXISTS",
                    "Já existe uma trilha de carreira com este código.");
            }
            throw error;
        }
    }

    async updateTrack(
        context: AuthenticationContext, trackId: string,
        input: UpdateCareerTrackInput, actor: AuditActor,
    ): Promise<CareerTrack> {
        const current = await this.getTrack(context, trackId);
        this.assertCanManageDepartment(context, current.departmentId);
        if (input.levels && current.profileCount > 0) {
            throw new AppError(409, "CAREER_TRACK_ALREADY_ASSIGNED",
                "Os níveis de uma trilha atribuída não podem ser alterados.",
                { profileCount: current.profileCount });
        }
        if (input.status === "archived" && current.profileCount > 0) {
            throw new AppError(409, "CAREER_TRACK_HAS_PROFILES",
                "A trilha possui perfis de carreira vinculados.");
        }
        let departmentId: string | null | undefined;
        if (input.departmentId !== undefined) {
            departmentId = await this.resolveDepartment(context, input.departmentId);
        }
        const levels = input.levels ?? current.levels.map((level) => ({
            positionId: level.positionId, name: level.name, description: level.description,
            minimumMonthsExperience: level.minimumMonthsExperience,
            requirements: level.requirements,
            competencies: level.competencies.map((item) => ({ name: item.name,
                description: item.description, category: item.category,
                requiredLevel: item.requiredLevel })),
            trainings: level.trainings.map((item) => ({ trainingId: item.trainingId,
                required: item.required })),
        }));
        await this.validateTrackLevels(context, levels, input.status ?? current.status,
            departmentId === undefined ? current.departmentId : departmentId);
        try {
            if (!await careerRepository.updateTrack(
                context.companyId, trackId, input, departmentId, actor,
            )) throw trackNotFound();
            return this.getTrack(context, trackId);
        } catch (error) {
            if (hasDatabaseConstraint(error, "career_tracks_code_per_company_unique")) {
                throw new AppError(409, "CAREER_TRACK_CODE_ALREADY_EXISTS",
                    "Já existe uma trilha de carreira com este código.");
            }
            throw error;
        }
    }

    async archiveTrack(
        context: AuthenticationContext, trackId: string, actor: AuditActor,
    ): Promise<void> {
        const track = await this.getTrack(context, trackId);
        this.assertCanManageDepartment(context, track.departmentId);
        if (track.profileCount > 0) {
            throw new AppError(409, "CAREER_TRACK_HAS_PROFILES",
                "A trilha possui perfis de carreira vinculados.");
        }
        if (!await careerRepository.archiveTrack(context.companyId, trackId, actor)) {
            throw trackNotFound();
        }
    }

    async getProfile(
        context: AuthenticationContext, employeeId: string,
    ): Promise<{ profile: CareerProfile; track: CareerTrack }> {
        const employee = await this.requireActiveEmployee(context, employeeId);
        this.assertEmployeeScope(context, employee);
        const profile = await careerRepository.findProfile(context.companyId, employeeId);
        if (!profile) throw profileNotFound();
        const track = await this.getTrack(context, profile.trackId);
        return { profile, track };
    }

    async upsertProfile(
        context: AuthenticationContext, employeeId: string,
        input: UpsertCareerProfileInput, actor: AuditActor,
    ): Promise<{ profile: CareerProfile; track: CareerTrack }> {
        const employee = await this.requireActiveEmployee(context, employeeId);
        this.assertEmployeeScope(context, employee);
        const track = await this.getTrack(context, input.trackId);
        if (track.status !== "published") {
            throw new AppError(409, "CAREER_TRACK_NOT_PUBLISHED",
                "Somente trilhas publicadas podem ser atribuídas.");
        }
        if (track.departmentId && track.departmentId !== employee.departmentId) {
            throw new AppError(422, "CAREER_TRACK_DEPARTMENT_MISMATCH",
                "A trilha não pertence ao departamento do colaborador.");
        }
        const current = this.findLevel(track, input.currentLevelId);
        const target = this.findLevel(track, input.targetLevelId);
        if (current && current.positionId !== employee.positionId) {
            throw new AppError(422, "CAREER_CURRENT_LEVEL_POSITION_MISMATCH",
                "O nível atual precisa corresponder ao cargo do colaborador.");
        }
        if (current && target && target.levelNumber <= current.levelNumber) {
            throw new AppError(422, "CAREER_TARGET_LEVEL_NOT_HIGHER",
                "O nível desejado precisa ser posterior ao nível atual.");
        }
        await careerRepository.upsertProfile(context.companyId, employeeId, input, actor);
        return this.getProfile(context, employeeId);
    }

    async getMyCareer(context: AuthenticationContext) {
        const profile = await careerRepository.findProfile(context.companyId, context.employeeId);
        if (!profile) return { profile: null, track: null };
        const track = await careerRepository.findTrack(context.companyId, profile.trackId);
        return { profile, track };
    }

    listPlans(context: AuthenticationContext, query: DevelopmentPlanListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return developmentPlansRepository.list(
            context.companyId, isAdministrator(context) ? undefined : context.departmentId, query,
        );
    }

    async getPlan(context: AuthenticationContext, planId: string): Promise<DevelopmentPlan> {
        const plan = await developmentPlansRepository.findById(
            context.companyId, planId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!plan) throw planNotFound();
        return plan;
    }

    async createPlan(
        context: AuthenticationContext, input: CreateDevelopmentPlanInput, actor: AuditActor,
    ): Promise<DevelopmentPlan> {
        const employee = await this.requireActiveEmployee(context, input.employeeId);
        this.assertEmployeeScope(context, employee);
        const managerEmployeeId = input.managerEmployeeId ?? context.employeeId;
        const manager = await this.requireActiveEmployee(context, managerEmployeeId);
        if (manager.departmentId !== employee.departmentId) {
            throw new AppError(422, "DEVELOPMENT_MANAGER_DEPARTMENT_MISMATCH",
                "O responsável pelo PDI precisa pertencer ao departamento do colaborador.");
        }
        await this.validatePlanSource(context, input, employee);
        await this.validatePlanContents(context, input, employee);
        try {
            const id = await developmentPlansRepository.create(
                context, input, managerEmployeeId, actor,
            );
            return this.getPlan(context, id);
        } catch (error) {
            if (hasDatabaseConstraint(error, "development_plans_active_employee_unique")) {
                throw new AppError(409, "DEVELOPMENT_PLAN_ALREADY_ACTIVE",
                    "O colaborador já possui um PDI ativo.");
            }
            throw error;
        }
    }

    async updatePlan(
        context: AuthenticationContext, planId: string,
        input: UpdateDevelopmentPlanInput, actor: AuditActor,
    ): Promise<DevelopmentPlan> {
        const current = await this.getPlan(context, planId);
        this.assertPlanManager(context, current);
        this.assertPlanOpen(current);
        const startsOn = input.startsOn ?? current.startsOn;
        const targetEndOn = input.targetEndOn ?? current.targetEndOn;
        if (targetEndOn < startsOn) {
            throw new AppError(422, "INVALID_DEVELOPMENT_PLAN_DATES",
                "A data final não pode ser anterior ao início do PDI.");
        }
        if (input.managerEmployeeId) {
            const manager = await this.requireActiveEmployee(context, input.managerEmployeeId);
            if (manager.departmentId !== current.departmentId) {
                throw new AppError(422, "DEVELOPMENT_MANAGER_DEPARTMENT_MISMATCH",
                    "O responsável precisa pertencer ao departamento do colaborador.");
            }
        }
        if (input.targetCareerLevelId) {
            const profile = await careerRepository.findProfile(context.companyId, current.employeeId);
            if (!profile) throw profileNotFound();
            const track = await this.getTrack(context, profile.trackId);
            this.findLevel(track, input.targetCareerLevelId, true);
        }
        if (!await developmentPlansRepository.updatePlan(
            context.companyId, planId, input, actor,
        )) throw planNotFound();
        return this.getPlan(context, planId);
    }

    async cancelPlan(
        context: AuthenticationContext, planId: string, actor: AuditActor,
    ): Promise<void> {
        const plan = await this.getPlan(context, planId);
        this.assertPlanManager(context, plan);
        if (plan.status === "completed") {
            throw new AppError(409, "DEVELOPMENT_PLAN_COMPLETED",
                "Um PDI concluído não pode ser cancelado.");
        }
        if (!await developmentPlansRepository.updatePlan(
            context.companyId, planId, { status: "cancelled" }, actor,
        )) throw planNotFound();
    }

    async updateAction(
        context: AuthenticationContext, planId: string, actionId: string,
        input: UpdateDevelopmentActionInput, actor: AuditActor,
    ): Promise<DevelopmentAction> {
        const plan = await this.getPlan(context, planId);
        this.assertPlanManager(context, plan);
        this.assertPlanOpen(plan);
        const action = this.requireAction(plan, actionId);
        await this.validateActionUpdate(context, plan, action, input);
        if (!await developmentPlansRepository.updateAction(
            context.companyId, planId, actionId, input, actor,
        )) throw actionNotFound();
        return this.requireAction(await this.getPlan(context, planId), actionId);
    }

    listMine(context: AuthenticationContext, query: MyDevelopmentPlanListQuery) {
        return developmentPlansRepository.listMine(context.companyId, context.employeeId, query);
    }

    async getMine(context: AuthenticationContext, planId: string): Promise<DevelopmentPlan> {
        const plan = await developmentPlansRepository.findMine(
            context.companyId, context.employeeId, planId,
        );
        if (!plan) throw planNotFound();
        return plan;
    }

    async updateMyAction(
        context: AuthenticationContext, planId: string, actionId: string,
        input: UpdateMyDevelopmentActionInput, actor: AuditActor,
    ): Promise<DevelopmentAction> {
        const plan = await this.getMine(context, planId);
        this.assertPlanOpen(plan);
        const action = this.requireAction(plan, actionId);
        if (action.responsibleEmployeeId !== context.employeeId) {
            throw new AppError(403, "DEVELOPMENT_ACTION_NOT_RESPONSIBLE",
                "Esta ação está atribuída a outro responsável.");
        }
        if (action.actionType === "training") {
            throw new AppError(409, "DEVELOPMENT_TRAINING_PROGRESS_AUTOMATIC",
                "O progresso será atualizado automaticamente pelo treinamento.");
        }
        if (!await developmentPlansRepository.updateAction(
            context.companyId, planId, actionId, input, actor,
        )) throw actionNotFound();
        return this.requireAction(await this.getMine(context, planId), actionId);
    }

    private async validateTrackLevels(
        context: AuthenticationContext, levels: CreateCareerTrackInput["levels"],
        status: CareerTrack["status"], departmentId: string | null,
    ): Promise<void> {
        for (const level of levels) {
            const position = await organizationRepository.findPosition(
                context.companyId, level.positionId,
            );
            if (!position) throw new AppError(422, "CAREER_POSITION_NOT_FOUND",
                "Um cargo informado na trilha não existe.", { positionId: level.positionId });
            if (!position.active) throw new AppError(409, "CAREER_POSITION_INACTIVE",
                "Todos os cargos da trilha precisam estar ativos.");
            if (departmentId && position.departmentId !== departmentId) {
                throw new AppError(422, "CAREER_POSITION_DEPARTMENT_MISMATCH",
                    "Os cargos precisam pertencer ao departamento da trilha.");
            }
            for (const link of level.trainings) {
                const training = await trainingsRepository.findTraining(
                    context.companyId, link.trainingId,
                );
                if (!training) throw new AppError(422, "CAREER_TRAINING_NOT_FOUND",
                    "Um treinamento informado na trilha não existe.");
                if (status === "published" && training.status !== "published") {
                    throw new AppError(409, "CAREER_TRAINING_NOT_PUBLISHED",
                        "Treinamentos de uma trilha publicada também precisam estar publicados.");
                }
            }
        }
    }

    private async validatePlanSource(
        context: AuthenticationContext, input: CreateDevelopmentPlanInput, employee: Employee,
    ): Promise<void> {
        if (input.evaluationAssignmentId) {
            const evaluation = await evaluationAssignmentsRepository.findById(
                context.companyId, input.evaluationAssignmentId,
            );
            if (!evaluation || evaluation.employeeId !== employee.id) {
                throw new AppError(422, "DEVELOPMENT_EVALUATION_MISMATCH",
                    "A avaliação informada não pertence ao colaborador.");
            }
            if (evaluation.status !== "completed") {
                throw new AppError(409, "DEVELOPMENT_EVALUATION_NOT_COMPLETED",
                    "Somente avaliações concluídas podem originar um PDI.");
            }
        }
        if (input.targetCareerLevelId) {
            const profile = await careerRepository.findProfile(context.companyId, employee.id);
            if (!profile) throw profileNotFound();
            const track = await this.getTrack(context, profile.trackId);
            this.findLevel(track, input.targetCareerLevelId, true);
        }
    }

    private async validatePlanContents(
        context: AuthenticationContext, input: CreateDevelopmentPlanInput, employee: Employee,
    ): Promise<void> {
        for (const objective of input.objectives) {
            if (objective.targetDate < input.startsOn || objective.targetDate > input.targetEndOn) {
                throw new AppError(422, "DEVELOPMENT_OBJECTIVE_OUTSIDE_PLAN",
                    "Os objetivos precisam estar dentro do período do PDI.");
            }
            for (const action of objective.actions) {
                const actionDate = action.dueAt.slice(0, 10);
                if (actionDate < input.startsOn || actionDate > input.targetEndOn) {
                    throw new AppError(422, "DEVELOPMENT_ACTION_OUTSIDE_PLAN",
                        "As ações precisam estar dentro do período do PDI.");
                }
                if (action.responsibleEmployeeId) {
                    const responsible = await this.requireActiveEmployee(
                        context, action.responsibleEmployeeId,
                    );
                    if (responsible.departmentId !== employee.departmentId) {
                        throw new AppError(422, "DEVELOPMENT_RESPONSIBLE_DEPARTMENT_MISMATCH",
                            "Os responsáveis precisam pertencer ao departamento do colaborador.");
                    }
                }
                if (action.trainingId) {
                    const training = await trainingsRepository.findTraining(
                        context.companyId, action.trainingId,
                    );
                    if (!training) throw new AppError(422, "DEVELOPMENT_TRAINING_NOT_FOUND",
                        "O treinamento informado não existe.");
                    if (training.status !== "published") {
                        throw new AppError(409, "DEVELOPMENT_TRAINING_NOT_PUBLISHED",
                            "O treinamento do PDI precisa estar publicado.");
                    }
                    if (training.departmentId && training.departmentId !== employee.departmentId) {
                        throw new AppError(422, "DEVELOPMENT_TRAINING_DEPARTMENT_MISMATCH",
                            "O treinamento não pertence ao departamento do colaborador.");
                    }
                }
            }
        }
    }

    private async validateActionUpdate(
        context: AuthenticationContext, plan: DevelopmentPlan, action: DevelopmentAction,
        input: UpdateDevelopmentActionInput,
    ): Promise<void> {
        if (action.status === "completed" || action.status === "cancelled") {
            throw new AppError(409, "DEVELOPMENT_ACTION_FINISHED",
                "Uma ação finalizada não pode ser reaberta.");
        }
        if ((input.status === "completed" || input.progressPercent === 100)
            && action.actionType === "training") {
            throw new AppError(409, "DEVELOPMENT_TRAINING_PROGRESS_AUTOMATIC",
                "A ação será concluída automaticamente pelo treinamento.");
        }
        if (input.dueAt && action.actionType === "mentoring") {
            throw new AppError(409, "DEVELOPMENT_MENTORING_RESCHEDULE_REQUIRED",
                "Reagende a mentoria pelo calendário para alterar o horário.");
        }
        if (input.responsibleEmployeeId) {
            const responsible = await this.requireActiveEmployee(context, input.responsibleEmployeeId);
            if (responsible.departmentId !== plan.departmentId) {
                throw new AppError(422, "DEVELOPMENT_RESPONSIBLE_DEPARTMENT_MISMATCH",
                    "O responsável precisa pertencer ao departamento do colaborador.");
            }
        }
    }

    private findLevel(track: CareerTrack, levelId?: string | null, required = false) {
        if (!levelId) return null;
        const level = track.levels.find((item) => item.id === levelId);
        if (!level && required) throw new AppError(422, "CAREER_LEVEL_NOT_IN_TRACK",
            "O nível informado não pertence à trilha de carreira.");
        if (!level) throw new AppError(422, "CAREER_LEVEL_NOT_IN_TRACK",
            "O nível informado não pertence à trilha de carreira.");
        return level;
    }

    private requireAction(plan: DevelopmentPlan, actionId: string): DevelopmentAction {
        const action = plan.objectives.flatMap((objective) => objective.actions)
            .find((item) => item.id === actionId);
        if (!action) throw actionNotFound();
        return action;
    }

    private assertPlanManager(context: AuthenticationContext, plan: DevelopmentPlan): void {
        if (isAdministrator(context)) return;
        if (plan.managerEmployeeId !== context.employeeId) {
            throw new AppError(403, "DEVELOPMENT_MANAGER_REQUIRED",
                "Somente o responsável pelo PDI pode executar esta operação.");
        }
    }

    private assertPlanOpen(plan: DevelopmentPlan): void {
        if (plan.status === "completed" || plan.status === "cancelled") {
            throw new AppError(409, "DEVELOPMENT_PLAN_FINISHED",
                "Um PDI finalizado não pode ser alterado.");
        }
    }

    private assertRequestedDepartment(context: AuthenticationContext, departmentId?: string): void {
        if (departmentId && !isAdministrator(context) && departmentId !== context.departmentId) {
            throw new AppError(403, "DEVELOPMENT_DEPARTMENT_SCOPE_DENIED",
                "Você só pode acessar dados do seu departamento.");
        }
    }

    private assertCanManageDepartment(
        context: AuthenticationContext, departmentId: string | null,
    ): void {
        if (isAdministrator(context)) return;
        if (departmentId !== context.departmentId) {
            throw new AppError(403, "DEVELOPMENT_MANAGEMENT_SCOPE_DENIED",
                "Você só pode gerenciar trilhas do seu departamento.");
        }
    }

    private assertEmployeeScope(context: AuthenticationContext, employee: Employee): void {
        if (!isAdministrator(context) && employee.departmentId !== context.departmentId) {
            throw new AppError(403, "DEVELOPMENT_EMPLOYEE_SCOPE_DENIED",
                "Você só pode gerenciar colaboradores do seu departamento.");
        }
    }

    private async resolveDepartment(
        context: AuthenticationContext, requestedDepartmentId?: string | null,
    ): Promise<string | null> {
        if (!isAdministrator(context) && !requestedDepartmentId) return context.departmentId;
        if (!isAdministrator(context) && requestedDepartmentId !== context.departmentId) {
            throw new AppError(403, "DEVELOPMENT_DEPARTMENT_SCOPE_DENIED",
                "Você só pode gerenciar trilhas do seu departamento.");
        }
        if (!requestedDepartmentId) return null;
        const department = await organizationRepository.findDepartment(
            context.companyId, requestedDepartmentId,
        );
        if (!department) throw new AppError(422, "DEVELOPMENT_DEPARTMENT_NOT_FOUND",
            "O departamento informado não existe.");
        if (!department.active) throw new AppError(409, "DEVELOPMENT_DEPARTMENT_INACTIVE",
            "O departamento informado está inativo.");
        return requestedDepartmentId;
    }

    private async requireActiveEmployee(
        context: AuthenticationContext, employeeId: string,
    ): Promise<Employee> {
        const employee = await employeesRepository.findById(context.companyId, employeeId);
        if (!employee) throw new AppError(422, "DEVELOPMENT_EMPLOYEE_NOT_FOUND",
            "O colaborador informado não existe.");
        if (employee.status !== "active") throw new AppError(409, "DEVELOPMENT_EMPLOYEE_INACTIVE",
            "O colaborador informado não está ativo.");
        return employee;
    }
}

export const developmentService = new DevelopmentService();
