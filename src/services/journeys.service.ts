import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    journeyAssignmentsRepository,
    type JourneyAssignmentDetail,
    type JourneyTask,
} from "../repositories/journey-assignments.repository.js";
import {
    journeyTemplatesRepository,
    type JourneyTemplate,
} from "../repositories/journey-templates.repository.js";
import { organizationRepository, type AuditActor } from "../repositories/organization.repository.js";
import { trainingsRepository } from "../repositories/trainings.repository.js";
import type {
    CreateJourneyAssignmentInput,
    CreateJourneyTemplateInput,
    JourneyAssignmentListQuery,
    JourneyTemplateListQuery,
    MyJourneyListQuery,
    UpdateJourneyAssignmentInput,
    UpdateJourneyTaskInput,
    UpdateJourneyTemplateInput,
    UpdateMyJourneyTaskInput,
} from "../schemas/journeys.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const templateNotFound = (): AppError => new AppError(
    404, "JOURNEY_TEMPLATE_NOT_FOUND", "Modelo de jornada não encontrado.",
);
const assignmentNotFound = (): AppError => new AppError(
    404, "JOURNEY_ASSIGNMENT_NOT_FOUND", "Jornada atribuída não encontrada.",
);
const taskNotFound = (): AppError => new AppError(
    404, "JOURNEY_TASK_NOT_FOUND", "Tarefa da jornada não encontrada.",
);
const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);
const dateInCuiaba = (): string => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Cuiaba", year: "numeric", month: "2-digit", day: "2-digit",
}).format(new Date());
const addDays = (date: string, days: number): string => {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
};

export class JourneysService {
    listTemplates(context: AuthenticationContext, query: JourneyTemplateListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return journeyTemplatesRepository.list(
            context.companyId, isAdministrator(context) ? undefined : context.departmentId, query,
        );
    }

    async getTemplate(
        context: AuthenticationContext, templateId: string,
    ): Promise<JourneyTemplate> {
        const template = await journeyTemplatesRepository.findById(
            context.companyId, templateId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!template) throw templateNotFound();
        return template;
    }

    async createTemplate(
        context: AuthenticationContext, input: CreateJourneyTemplateInput, actor: AuditActor,
    ): Promise<JourneyTemplate> {
        const departmentId = await this.resolveDepartment(context, input.departmentId);
        await this.validateTrainings(context, input.stages, input.status, departmentId);
        try {
            const id = await journeyTemplatesRepository.create(
                context.companyId, departmentId, input, actor,
            );
            return this.getTemplate(context, id);
        } catch (error) {
            if (hasDatabaseConstraint(error, "journey_templates_code_per_company_unique")) {
                throw new AppError(409, "JOURNEY_TEMPLATE_CODE_ALREADY_EXISTS",
                    "Já existe um modelo de jornada com este código.");
            }
            throw error;
        }
    }

    async updateTemplate(
        context: AuthenticationContext, templateId: string,
        input: UpdateJourneyTemplateInput, actor: AuditActor,
    ): Promise<JourneyTemplate> {
        const current = await this.getTemplate(context, templateId);
        this.assertCanManageDepartment(context, current.departmentId);
        const durationDays = input.durationDays ?? current.durationDays;
        const stages = input.stages ?? current.stages.map((stage) => ({
            name: stage.name, description: stage.description,
            startsAfterDays: stage.startsAfterDays,
            tasks: stage.tasks.map((task) => ({
                title: task.title, description: task.description, taskType: task.taskType,
                responsible: task.responsible, required: task.required,
                dueAfterDays: task.dueAfterDays, trainingId: task.trainingId,
                meetingTime: task.meetingTime,
                meetingDurationMinutes: task.meetingDurationMinutes,
                resourceUrl: task.resourceUrl,
            })),
        }));
        if (stages.some((stage) => stage.startsAfterDays > durationDays
            || stage.tasks.some((task) => task.dueAfterDays > durationDays))) {
            throw new AppError(422, "JOURNEY_TEMPLATE_DURATION_EXCEEDED",
                "Fases e tarefas precisam estar dentro da duração da jornada.");
        }
        if (input.stages) {
            const assignmentCount = await journeyAssignmentsRepository.countByTemplate(
                context.companyId, templateId,
            );
            if (assignmentCount > 0) {
                throw new AppError(409, "JOURNEY_TEMPLATE_ALREADY_ASSIGNED",
                    "As etapas de um modelo já atribuído não podem ser alteradas.",
                    { assignmentCount });
            }
        }
        let departmentId: string | null | undefined;
        if (input.departmentId !== undefined) {
            departmentId = await this.resolveDepartment(context, input.departmentId);
        }
        await this.validateTrainings(context, stages, input.status ?? current.status,
            departmentId === undefined ? current.departmentId : departmentId);
        try {
            const updated = await journeyTemplatesRepository.update(
                context.companyId, templateId, input, departmentId, actor,
            );
            if (!updated) throw templateNotFound();
            return this.getTemplate(context, templateId);
        } catch (error) {
            if (hasDatabaseConstraint(error, "journey_templates_code_per_company_unique")) {
                throw new AppError(409, "JOURNEY_TEMPLATE_CODE_ALREADY_EXISTS",
                    "Já existe um modelo de jornada com este código.");
            }
            throw error;
        }
    }

    async archiveTemplate(
        context: AuthenticationContext, templateId: string, actor: AuditActor,
    ): Promise<void> {
        const template = await this.getTemplate(context, templateId);
        this.assertCanManageDepartment(context, template.departmentId);
        const assignments = await journeyAssignmentsRepository.countByTemplate(
            context.companyId, templateId,
        );
        if (assignments > 0) {
            throw new AppError(409, "JOURNEY_TEMPLATE_HAS_ASSIGNMENTS",
                "O modelo possui jornadas atribuídas e não pode ser arquivado.", { assignments });
        }
        if (!await journeyTemplatesRepository.archive(context.companyId, templateId, actor)) {
            throw templateNotFound();
        }
    }

    listAssignments(context: AuthenticationContext, query: JourneyAssignmentListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return journeyAssignmentsRepository.list(
            context.companyId, isAdministrator(context) ? undefined : context.departmentId, query,
        );
    }

    async getAssignment(
        context: AuthenticationContext, assignmentId: string,
    ): Promise<JourneyAssignmentDetail> {
        const assignment = await journeyAssignmentsRepository.findById(
            context.companyId, assignmentId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!assignment) throw assignmentNotFound();
        return assignment;
    }

    async createAssignment(
        context: AuthenticationContext, input: CreateJourneyAssignmentInput, actor: AuditActor,
    ): Promise<JourneyAssignmentDetail> {
        const template = await this.getTemplate(context, input.templateId);
        if (template.status !== "published") {
            throw new AppError(409, "JOURNEY_TEMPLATE_NOT_PUBLISHED",
                "Somente modelos publicados podem ser atribuídos.");
        }
        const employee = await this.requireActiveEmployee(context, input.employeeId);
        if (!isAdministrator(context) && employee.departmentId !== context.departmentId) {
            throw new AppError(403, "JOURNEY_EMPLOYEE_SCOPE_DENIED",
                "Você só pode atribuir jornadas a colaboradores do seu departamento.");
        }
        if (template.departmentId && template.departmentId !== employee.departmentId) {
            throw new AppError(422, "JOURNEY_TEMPLATE_DEPARTMENT_MISMATCH",
                "O modelo não pertence ao departamento do colaborador.");
        }
        const ownerEmployeeId = input.ownerEmployeeId ?? context.employeeId;
        const owner = await this.requireActiveEmployee(context, ownerEmployeeId);
        if (owner.departmentId !== employee.departmentId) {
            throw new AppError(422, "JOURNEY_OWNER_DEPARTMENT_MISMATCH",
                "O responsável precisa pertencer ao departamento do colaborador.");
        }
        const startsOn = input.startsOn ?? dateInCuiaba();
        try {
            const id = await journeyAssignmentsRepository.create(context, {
                templateId: template.id, employeeId: employee.id, ownerEmployeeId: owner.id,
                startsOn, targetEndOn: addDays(startsOn, template.durationDays),
                notes: input.notes ?? null,
            }, actor);
            return this.getAssignment(context, id);
        } catch (error) {
            if (hasDatabaseConstraint(error,
                "journey_assignments_active_template_employee_unique")) {
                throw new AppError(409, "JOURNEY_ALREADY_ASSIGNED",
                    "Este modelo já está ativo para o colaborador.");
            }
            throw error;
        }
    }

    async updateAssignment(
        context: AuthenticationContext, assignmentId: string,
        input: UpdateJourneyAssignmentInput, actor: AuditActor,
    ): Promise<JourneyAssignmentDetail> {
        const current = await this.getAssignment(context, assignmentId);
        if (current.status === "completed" || current.status === "cancelled") {
            throw new AppError(409, "JOURNEY_ASSIGNMENT_FINISHED",
                "Uma jornada finalizada não pode ser alterada.");
        }
        if (input.targetEndOn && input.targetEndOn < current.startsOn) {
            throw new AppError(422, "INVALID_JOURNEY_TARGET_DATE",
                "A data final não pode ser anterior ao início da jornada.");
        }
        if (input.ownerEmployeeId) {
            const owner = await this.requireActiveEmployee(context, input.ownerEmployeeId);
            if (owner.departmentId !== current.departmentId) {
                throw new AppError(422, "JOURNEY_OWNER_DEPARTMENT_MISMATCH",
                    "O responsável precisa pertencer ao departamento do colaborador.");
            }
        }
        if (!await journeyAssignmentsRepository.update(
            context.companyId, assignmentId, input, actor,
        )) throw assignmentNotFound();
        return this.getAssignment(context, assignmentId);
    }

    async cancelAssignment(
        context: AuthenticationContext, assignmentId: string, actor: AuditActor,
    ): Promise<void> {
        const current = await this.getAssignment(context, assignmentId);
        if (current.status === "completed") {
            throw new AppError(409, "JOURNEY_ASSIGNMENT_COMPLETED",
                "Uma jornada concluída não pode ser cancelada.");
        }
        if (!await journeyAssignmentsRepository.cancel(context.companyId, assignmentId, actor)) {
            throw assignmentNotFound();
        }
    }

    async updateTask(
        context: AuthenticationContext, assignmentId: string, taskId: string,
        input: UpdateJourneyTaskInput, actor: AuditActor,
    ): Promise<JourneyTask> {
        const assignment = await this.getAssignment(context, assignmentId);
        const task = this.requireTask(assignment, taskId);
        await this.validateTaskChange(context, assignment, task, input, false);
        if (!await journeyAssignmentsRepository.updateTask(
            context.companyId, assignmentId, taskId, input, actor,
        )) throw taskNotFound();
        return this.requireTask(await this.getAssignment(context, assignmentId), taskId);
    }

    listMine(context: AuthenticationContext, query: MyJourneyListQuery) {
        return journeyAssignmentsRepository.listMine(context.companyId, context.employeeId, query);
    }

    async getMine(
        context: AuthenticationContext, assignmentId: string,
    ): Promise<JourneyAssignmentDetail> {
        const assignment = await journeyAssignmentsRepository.findMine(
            context.companyId, context.employeeId, assignmentId,
        );
        if (!assignment) throw assignmentNotFound();
        return assignment;
    }

    async updateMyTask(
        context: AuthenticationContext, assignmentId: string, taskId: string,
        input: UpdateMyJourneyTaskInput, actor: AuditActor,
    ): Promise<JourneyTask> {
        const assignment = await this.getMine(context, assignmentId);
        const task = this.requireTask(assignment, taskId);
        if (task.responsibleEmployeeId !== context.employeeId) {
            throw new AppError(403, "JOURNEY_TASK_NOT_RESPONSIBLE",
                "Esta tarefa está atribuída a outro responsável.");
        }
        await this.validateTaskChange(context, assignment, task, input, true);
        if (!await journeyAssignmentsRepository.updateTask(
            context.companyId, assignmentId, taskId, input, actor,
        )) throw taskNotFound();
        return this.requireTask(await this.getMine(context, assignmentId), taskId);
    }

    private requireTask(assignment: JourneyAssignmentDetail, taskId: string): JourneyTask {
        const task = assignment.stages.flatMap((stage) => stage.tasks)
            .find((candidate) => candidate.id === taskId);
        if (!task) throw taskNotFound();
        return task;
    }

    private async validateTaskChange(
        context: AuthenticationContext, assignment: JourneyAssignmentDetail,
        task: JourneyTask, input: UpdateJourneyTaskInput | UpdateMyJourneyTaskInput,
        selfService: boolean,
    ): Promise<void> {
        if (assignment.status === "completed" || assignment.status === "cancelled") {
            throw new AppError(409, "JOURNEY_ASSIGNMENT_FINISHED",
                "As tarefas de uma jornada finalizada não podem ser alteradas.");
        }
        if (task.status === "completed" || task.status === "skipped") {
            throw new AppError(409, "JOURNEY_TASK_FINISHED",
                "Uma tarefa finalizada não pode ser reaberta.");
        }
        if (input.status === "skipped" && task.required) {
            throw new AppError(422, "JOURNEY_REQUIRED_TASK_CANNOT_SKIP",
                "Uma tarefa obrigatória não pode ser ignorada.");
        }
        if (input.status === "completed" && task.taskType === "training") {
            throw new AppError(409, "JOURNEY_TRAINING_COMPLETION_AUTOMATIC",
                "A tarefa será concluída automaticamente ao finalizar o treinamento.");
        }
        if (selfService && "responsibleEmployeeId" in input) {
            throw new AppError(403, "JOURNEY_TASK_REASSIGN_DENIED",
                "O colaborador não pode reatribuir a própria tarefa.");
        }
        if ("responsibleEmployeeId" in input && input.responsibleEmployeeId) {
            const responsible = await this.requireActiveEmployee(context, input.responsibleEmployeeId);
            if (responsible.departmentId !== assignment.departmentId) {
                throw new AppError(422, "JOURNEY_TASK_RESPONSIBLE_DEPARTMENT_MISMATCH",
                    "O responsável precisa pertencer ao departamento da jornada.");
            }
        }
    }

    private async validateTrainings(
        context: AuthenticationContext,
        stages: CreateJourneyTemplateInput["stages"],
        status: JourneyTemplate["status"],
        departmentId: string | null,
    ): Promise<void> {
        const ids = [...new Set(stages.flatMap((stage) => stage.tasks)
            .map((task) => task.trainingId).filter((id): id is string => Boolean(id)))];
        for (const id of ids) {
            const training = await trainingsRepository.findTraining(context.companyId, id);
            if (!training) {
                throw new AppError(422, "JOURNEY_TRAINING_NOT_FOUND",
                    "Um treinamento vinculado não existe.", { trainingId: id });
            }
            if (training.departmentId && training.departmentId !== departmentId) {
                throw new AppError(422, "JOURNEY_TRAINING_DEPARTMENT_MISMATCH",
                    "O treinamento vinculado não pertence ao departamento do modelo.",
                    { trainingId: id });
            }
            if (status === "published" && training.status !== "published") {
                throw new AppError(409, "JOURNEY_TRAINING_NOT_PUBLISHED",
                    "Todos os treinamentos do modelo precisam estar publicados.",
                    { trainingId: id });
            }
        }
    }

    private assertRequestedDepartment(
        context: AuthenticationContext, departmentId?: string,
    ): void {
        if (departmentId && !isAdministrator(context) && departmentId !== context.departmentId) {
            throw new AppError(403, "JOURNEY_DEPARTMENT_SCOPE_DENIED",
                "Você só pode acessar jornadas do seu departamento.");
        }
    }

    private assertCanManageDepartment(
        context: AuthenticationContext, departmentId: string | null,
    ): void {
        if (isAdministrator(context)) return;
        if (departmentId !== context.departmentId) {
            throw new AppError(403, "JOURNEY_MANAGEMENT_SCOPE_DENIED",
                "Você só pode gerenciar modelos do seu departamento.");
        }
    }

    private async resolveDepartment(
        context: AuthenticationContext, requestedDepartmentId?: string | null,
    ): Promise<string | null> {
        if (!isAdministrator(context) && !requestedDepartmentId) return context.departmentId;
        if (!isAdministrator(context) && requestedDepartmentId !== context.departmentId) {
            throw new AppError(403, "JOURNEY_DEPARTMENT_SCOPE_DENIED",
                "Você só pode gerenciar jornadas do seu departamento.");
        }
        if (!requestedDepartmentId) return null;
        const department = await organizationRepository.findDepartment(
            context.companyId, requestedDepartmentId,
        );
        if (!department) throw new AppError(422, "JOURNEY_DEPARTMENT_NOT_FOUND",
            "O departamento informado não existe.");
        if (!department.active) throw new AppError(409, "JOURNEY_DEPARTMENT_INACTIVE",
            "O departamento informado está inativo.");
        return requestedDepartmentId;
    }

    private async requireActiveEmployee(
        context: AuthenticationContext, employeeId: string,
    ) {
        const employee = await journeyAssignmentsRepository.findEmployee(
            context.companyId, employeeId,
        );
        if (!employee) throw new AppError(422, "JOURNEY_EMPLOYEE_NOT_FOUND",
            "O colaborador informado não existe.");
        if (employee.status !== "active") throw new AppError(409, "JOURNEY_EMPLOYEE_INACTIVE",
            "O colaborador informado não está ativo.");
        return employee;
    }
}

export const journeysService = new JourneysService();
