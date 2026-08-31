import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    evaluationAssignmentsRepository,
    type EvaluationAssignmentDetail,
    type EvaluationEmployee,
    type PerformanceGoal,
} from "../repositories/evaluation-assignments.repository.js";
import {
    evaluationCyclesRepository,
    type EvaluationCycle,
} from "../repositories/evaluation-cycles.repository.js";
import { organizationRepository, type AuditActor } from "../repositories/organization.repository.js";
import type {
    AssignEvaluationParticipantsInput,
    CompleteEvaluationFeedbackInput,
    CreateEvaluationCycleInput,
    CreatePerformanceGoalInput,
    EvaluationAssignmentListQuery,
    EvaluationCycleListQuery,
    MyEvaluationListQuery,
    ScheduleEvaluationFeedbackInput,
    SubmitManagerReviewInput,
    SubmitSelfReviewInput,
    UpdateEvaluationCycleInput,
    UpdateMyPerformanceGoalInput,
    UpdatePerformanceGoalInput,
} from "../schemas/evaluations.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const cycleNotFound = (): AppError => new AppError(
    404, "EVALUATION_CYCLE_NOT_FOUND", "Ciclo de avaliação não encontrado.",
);
const assignmentNotFound = (): AppError => new AppError(
    404, "EVALUATION_ASSIGNMENT_NOT_FOUND", "Avaliação atribuída não encontrada.",
);
const goalNotFound = (): AppError => new AppError(
    404, "PERFORMANCE_GOAL_NOT_FOUND", "Meta de desempenho não encontrada.",
);
const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);

export class EvaluationsService {
    listCycles(context: AuthenticationContext, query: EvaluationCycleListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return evaluationCyclesRepository.list(
            context.companyId, isAdministrator(context) ? undefined : context.departmentId, query,
        );
    }

    async getCycle(context: AuthenticationContext, cycleId: string): Promise<EvaluationCycle> {
        const cycle = await evaluationCyclesRepository.findById(
            context.companyId, cycleId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!cycle) throw cycleNotFound();
        return cycle;
    }

    async createCycle(
        context: AuthenticationContext, input: CreateEvaluationCycleInput, actor: AuditActor,
    ): Promise<EvaluationCycle> {
        const departmentId = await this.resolveDepartment(context, input.departmentId);
        try {
            const id = await evaluationCyclesRepository.create(
                context.companyId, departmentId, input, actor,
            );
            return this.getCycle(context, id);
        } catch (error) {
            if (hasDatabaseConstraint(error, "evaluation_cycles_code_per_company_unique")) {
                throw new AppError(409, "EVALUATION_CYCLE_CODE_ALREADY_EXISTS",
                    "Já existe um ciclo de avaliação com este código.");
            }
            throw error;
        }
    }

    async updateCycle(
        context: AuthenticationContext, cycleId: string,
        input: UpdateEvaluationCycleInput, actor: AuditActor,
    ): Promise<EvaluationCycle> {
        const current = await this.getCycle(context, cycleId);
        this.assertCanManageDepartment(context, current.departmentId);
        this.assertCycleTransition(current, input.status);
        const dates = {
            startsOn: input.startsOn ?? current.startsOn,
            selfReviewDeadline: input.selfReviewDeadline ?? current.selfReviewDeadline,
            managerReviewDeadline: input.managerReviewDeadline ?? current.managerReviewDeadline,
            feedbackDeadline: input.feedbackDeadline ?? current.feedbackDeadline,
        };
        if (!(dates.startsOn <= dates.selfReviewDeadline
            && dates.selfReviewDeadline <= dates.managerReviewDeadline
            && dates.managerReviewDeadline <= dates.feedbackDeadline)) {
            throw new AppError(422, "INVALID_EVALUATION_CYCLE_DATES",
                "As datas do ciclo de avaliação estão fora de ordem.");
        }
        const selfWeight = input.selfWeight ?? current.selfWeight;
        const managerWeight = input.managerWeight ?? current.managerWeight;
        if (Math.abs(selfWeight + managerWeight - 100) >= 0.001) {
            throw new AppError(422, "INVALID_EVALUATION_REVIEW_WEIGHTS",
                "Os pesos da autoavaliação e do gestor devem somar 100.");
        }
        if (input.competencies && current.assignmentCount > 0) {
            throw new AppError(409, "EVALUATION_CYCLE_ALREADY_ASSIGNED",
                "As competências de um ciclo já atribuído não podem ser alteradas.",
                { assignmentCount: current.assignmentCount });
        }
        if (input.status === "completed"
            && current.completedAssignmentCount !== current.assignmentCount) {
            throw new AppError(409, "EVALUATION_CYCLE_HAS_PENDING_ASSIGNMENTS",
                "Todas as avaliações precisam ser concluídas antes de finalizar o ciclo.");
        }
        if (input.status === "cancelled" && current.assignmentCount > 0) {
            throw new AppError(409, "EVALUATION_CYCLE_HAS_ASSIGNMENTS",
                "Cancele as avaliações atribuídas antes de cancelar o ciclo.");
        }
        let departmentId: string | null | undefined;
        if (input.departmentId !== undefined) {
            departmentId = await this.resolveDepartment(context, input.departmentId);
        }
        try {
            if (!await evaluationCyclesRepository.update(
                context.companyId, cycleId, input, departmentId, actor,
            )) throw cycleNotFound();
            return this.getCycle(context, cycleId);
        } catch (error) {
            if (hasDatabaseConstraint(error, "evaluation_cycles_code_per_company_unique")) {
                throw new AppError(409, "EVALUATION_CYCLE_CODE_ALREADY_EXISTS",
                    "Já existe um ciclo de avaliação com este código.");
            }
            throw error;
        }
    }

    async archiveCycle(
        context: AuthenticationContext, cycleId: string, actor: AuditActor,
    ): Promise<void> {
        const cycle = await this.getCycle(context, cycleId);
        this.assertCanManageDepartment(context, cycle.departmentId);
        if (cycle.assignmentCount > 0) {
            throw new AppError(409, "EVALUATION_CYCLE_HAS_ASSIGNMENTS",
                "O ciclo possui avaliações atribuídas e não pode ser arquivado.");
        }
        if (!await evaluationCyclesRepository.archive(context.companyId, cycleId, actor)) {
            throw cycleNotFound();
        }
    }

    listAssignments(context: AuthenticationContext, query: EvaluationAssignmentListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return evaluationAssignmentsRepository.list(
            context.companyId, isAdministrator(context) ? undefined : context.departmentId, query,
        );
    }

    async getAssignment(
        context: AuthenticationContext, assignmentId: string,
    ): Promise<EvaluationAssignmentDetail> {
        const assignment = await evaluationAssignmentsRepository.findById(
            context.companyId, assignmentId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!assignment) throw assignmentNotFound();
        return assignment;
    }

    async assignParticipants(
        context: AuthenticationContext, cycleId: string,
        input: AssignEvaluationParticipantsInput, actor: AuditActor,
    ) {
        const cycle = await this.getCycle(context, cycleId);
        this.assertCanManageDepartment(context, cycle.departmentId);
        if (!(["scheduled", "active"] as EvaluationCycle["status"][]).includes(cycle.status)) {
            throw new AppError(409, "EVALUATION_CYCLE_NOT_ASSIGNABLE",
                "O ciclo precisa estar agendado ou ativo para receber participantes.");
        }
        for (const participant of input.participants) {
            const [employee, evaluator] = await Promise.all([
                this.requireActiveEmployee(context, participant.employeeId),
                this.requireActiveEmployee(context, participant.evaluatorEmployeeId),
            ]);
            this.assertEmployeeScope(context, employee);
            if (cycle.departmentId && employee.departmentId !== cycle.departmentId) {
                throw new AppError(422, "EVALUATION_EMPLOYEE_DEPARTMENT_MISMATCH",
                    "O colaborador não pertence ao departamento do ciclo.");
            }
            if (evaluator.departmentId !== employee.departmentId) {
                throw new AppError(422, "EVALUATION_EVALUATOR_DEPARTMENT_MISMATCH",
                    "O avaliador precisa pertencer ao departamento do colaborador.");
            }
        }
        const ids = await evaluationAssignmentsRepository.assignParticipants(
            context.companyId, cycleId, input.participants,
            cycle.status === "active" ? "self_review" : "pending", actor,
        );
        return { assigned: ids.length, skipped: input.participants.length - ids.length,
            assignments: await Promise.all(ids.map((id) => this.getAssignment(context, id))) };
    }

    async cancelAssignment(
        context: AuthenticationContext, assignmentId: string, actor: AuditActor,
    ): Promise<void> {
        const assignment = await this.getAssignment(context, assignmentId);
        if (assignment.status === "completed") {
            throw new AppError(409, "EVALUATION_ASSIGNMENT_COMPLETED",
                "Uma avaliação concluída não pode ser cancelada.");
        }
        if (!await evaluationAssignmentsRepository.cancelAssignment(
            context.companyId, assignmentId, actor,
        )) throw assignmentNotFound();
    }

    async submitManagerReview(
        context: AuthenticationContext, assignmentId: string,
        input: SubmitManagerReviewInput, actor: AuditActor,
    ): Promise<EvaluationAssignmentDetail> {
        const assignment = await this.getAssignment(context, assignmentId);
        this.assertEvaluator(context, assignment);
        if (assignment.cycleStatus !== "active") {
            throw new AppError(409, "EVALUATION_CYCLE_NOT_ACTIVE",
                "O ciclo precisa estar ativo para receber avaliações.");
        }
        if (assignment.status !== "manager_review") {
            throw new AppError(409, "EVALUATION_MANAGER_REVIEW_NOT_AVAILABLE",
                "A autoavaliação precisa ser enviada antes da avaliação do gestor.");
        }
        await this.validateCompleteResponses(context, assignment.cycleId, input.responses);
        if (!await evaluationAssignmentsRepository.submitManagerReview(
            context.companyId, assignmentId, input, actor,
        )) throw assignmentNotFound();
        return this.getAssignment(context, assignmentId);
    }

    async scheduleFeedback(
        context: AuthenticationContext, assignmentId: string,
        input: ScheduleEvaluationFeedbackInput, actor: AuditActor,
    ): Promise<EvaluationAssignmentDetail> {
        const assignment = await this.getAssignment(context, assignmentId);
        this.assertEvaluator(context, assignment);
        if (assignment.status !== "feedback_pending") {
            throw new AppError(409, "EVALUATION_FEEDBACK_NOT_AVAILABLE",
                "O feedback só pode ser agendado após a avaliação do gestor.");
        }
        if (input.startsAt.slice(0, 10) > assignment.feedbackDeadline) {
            throw new AppError(422, "EVALUATION_FEEDBACK_AFTER_DEADLINE",
                "A reunião de feedback não pode ultrapassar o prazo do ciclo.");
        }
        await evaluationAssignmentsRepository.scheduleFeedback(assignment, input, actor);
        return this.getAssignment(context, assignmentId);
    }

    async completeFeedback(
        context: AuthenticationContext, assignmentId: string,
        input: CompleteEvaluationFeedbackInput, actor: AuditActor,
    ): Promise<EvaluationAssignmentDetail> {
        const assignment = await this.getAssignment(context, assignmentId);
        this.assertEvaluator(context, assignment);
        if (assignment.status !== "feedback_pending") {
            throw new AppError(409, "EVALUATION_FEEDBACK_NOT_AVAILABLE",
                "A avaliação não está aguardando feedback.");
        }
        if (!assignment.feedbackEventId) {
            throw new AppError(409, "EVALUATION_FEEDBACK_NOT_SCHEDULED",
                "Agende a reunião de feedback antes de concluir a avaliação.");
        }
        if (!await evaluationAssignmentsRepository.completeFeedback(
            context.companyId, assignmentId, input.finalFeedback, actor,
        )) throw assignmentNotFound();
        return this.getAssignment(context, assignmentId);
    }

    async createGoal(
        context: AuthenticationContext, assignmentId: string,
        input: CreatePerformanceGoalInput, actor: AuditActor,
    ): Promise<PerformanceGoal> {
        const assignment = await this.getAssignment(context, assignmentId);
        this.assertEvaluator(context, assignment);
        this.assertAssignmentOpen(assignment);
        if (input.targetDate < assignment.startsOn) {
            throw new AppError(422, "PERFORMANCE_GOAL_BEFORE_CYCLE",
                "A data da meta não pode ser anterior ao início do ciclo.");
        }
        this.assertGoalWeight(assignment, input.weight);
        const id = await evaluationAssignmentsRepository.createGoal(
            context.companyId, assignmentId, input, actor,
        );
        return this.requireGoal(await this.getAssignment(context, assignmentId), id);
    }

    async updateGoal(
        context: AuthenticationContext, assignmentId: string, goalId: string,
        input: UpdatePerformanceGoalInput, actor: AuditActor,
    ): Promise<PerformanceGoal> {
        const assignment = await this.getAssignment(context, assignmentId);
        this.assertEvaluator(context, assignment);
        this.assertAssignmentOpen(assignment);
        const current = this.requireGoal(assignment, goalId);
        if (input.targetDate && input.targetDate < assignment.startsOn) {
            throw new AppError(422, "PERFORMANCE_GOAL_BEFORE_CYCLE",
                "A data da meta não pode ser anterior ao início do ciclo.");
        }
        if (input.weight !== undefined) this.assertGoalWeight(assignment, input.weight, current.id);
        if (!await evaluationAssignmentsRepository.updateGoal(
            context.companyId, goalId, input, actor,
        )) throw goalNotFound();
        return this.requireGoal(await this.getAssignment(context, assignmentId), goalId);
    }

    async archiveGoal(
        context: AuthenticationContext, assignmentId: string, goalId: string, actor: AuditActor,
    ): Promise<void> {
        const assignment = await this.getAssignment(context, assignmentId);
        this.assertEvaluator(context, assignment);
        this.assertAssignmentOpen(assignment);
        this.requireGoal(assignment, goalId);
        if (!await evaluationAssignmentsRepository.archiveGoal(
            context.companyId, goalId, actor,
        )) throw goalNotFound();
    }

    async listMine(context: AuthenticationContext, query: MyEvaluationListQuery) {
        const result = await evaluationAssignmentsRepository.listMine(
            context.companyId, context.employeeId, query,
        );
        return {
            ...result,
            items: result.items.map((assignment) => assignment.status === "completed"
                ? assignment
                : { ...assignment, managerScore: null, finalScore: null,
                    strengths: null, improvementPoints: null,
                    developmentActions: null, finalFeedback: null }),
        };
    }

    async getMine(
        context: AuthenticationContext, assignmentId: string,
    ): Promise<EvaluationAssignmentDetail> {
        const assignment = await evaluationAssignmentsRepository.findMine(
            context.companyId, context.employeeId, assignmentId,
        );
        if (!assignment) throw assignmentNotFound();
        return this.sanitizeForEmployee(assignment);
    }

    async submitSelfReview(
        context: AuthenticationContext, assignmentId: string,
        input: SubmitSelfReviewInput, actor: AuditActor,
    ): Promise<EvaluationAssignmentDetail> {
        const assignment = await evaluationAssignmentsRepository.findMine(
            context.companyId, context.employeeId, assignmentId,
        );
        if (!assignment) throw assignmentNotFound();
        if (assignment.cycleStatus !== "active") {
            throw new AppError(409, "EVALUATION_CYCLE_NOT_ACTIVE",
                "O ciclo precisa estar ativo para receber a autoavaliação.");
        }
        if (!(["pending", "self_review"] as EvaluationAssignmentDetail["status"][])
            .includes(assignment.status)) {
            throw new AppError(409, "EVALUATION_SELF_REVIEW_NOT_AVAILABLE",
                "A autoavaliação já foi enviada ou não está disponível.");
        }
        await this.validateCompleteResponses(context, assignment.cycleId, input.responses);
        if (!await evaluationAssignmentsRepository.submitSelfReview(
            context.companyId, assignmentId, input, actor,
        )) throw assignmentNotFound();
        return this.getMine(context, assignmentId);
    }

    async updateMyGoal(
        context: AuthenticationContext, assignmentId: string, goalId: string,
        input: UpdateMyPerformanceGoalInput, actor: AuditActor,
    ): Promise<PerformanceGoal> {
        const assignment = await evaluationAssignmentsRepository.findMine(
            context.companyId, context.employeeId, assignmentId,
        );
        if (!assignment) throw assignmentNotFound();
        this.assertAssignmentOpen(assignment);
        this.requireGoal(assignment, goalId);
        if (!await evaluationAssignmentsRepository.updateMyGoal(
            context.companyId, goalId, input, actor,
        )) throw goalNotFound();
        const updated = await evaluationAssignmentsRepository.findMine(
            context.companyId, context.employeeId, assignmentId,
        );
        if (!updated) throw assignmentNotFound();
        return this.requireGoal(updated, goalId);
    }

    private async validateCompleteResponses(
        context: AuthenticationContext, cycleId: string,
        responses: Array<{ competencyId: string }>,
    ): Promise<void> {
        const cycle = await this.getCycle(context, cycleId);
        const expected = cycle.competencies.map((item) => item.id).sort();
        const received = responses.map((item) => item.competencyId).sort();
        if (expected.length !== received.length
            || expected.some((id, index) => id !== received[index])) {
            throw new AppError(422, "EVALUATION_RESPONSES_INCOMPLETE",
                "Todas as competências do ciclo precisam ser avaliadas.");
        }
    }

    private sanitizeForEmployee(assignment: EvaluationAssignmentDetail): EvaluationAssignmentDetail {
        if (assignment.status === "completed") return assignment;
        return {
            ...assignment,
            managerScore: null,
            finalScore: null,
            strengths: null,
            improvementPoints: null,
            developmentActions: null,
            finalFeedback: null,
            responses: assignment.responses.filter((response) => response.reviewerType === "self"),
        };
    }

    private assertCycleTransition(cycle: EvaluationCycle, next?: EvaluationCycle["status"]): void {
        if (!next || next === cycle.status) return;
        const transitions: Record<EvaluationCycle["status"], EvaluationCycle["status"][]> = {
            draft: ["scheduled", "active", "cancelled"],
            scheduled: ["draft", "active", "cancelled"],
            active: ["completed", "cancelled"],
            completed: [], cancelled: [],
        };
        if (!transitions[cycle.status].includes(next)) {
            throw new AppError(409, "INVALID_EVALUATION_CYCLE_TRANSITION",
                "A alteração de estado do ciclo não é permitida.");
        }
    }

    private assertEvaluator(
        context: AuthenticationContext, assignment: EvaluationAssignmentDetail,
    ): void {
        if (isAdministrator(context)) return;
        if (assignment.evaluatorEmployeeId !== context.employeeId) {
            throw new AppError(403, "EVALUATION_EVALUATOR_REQUIRED",
                "Somente o avaliador responsável pode executar esta operação.");
        }
    }

    private assertAssignmentOpen(assignment: EvaluationAssignmentDetail): void {
        if (assignment.status === "completed" || assignment.status === "cancelled") {
            throw new AppError(409, "EVALUATION_ASSIGNMENT_FINISHED",
                "Uma avaliação finalizada não pode ser alterada.");
        }
    }

    private assertGoalWeight(
        assignment: EvaluationAssignmentDetail, weight: number, excludedGoalId?: string,
    ): void {
        const total = assignment.goals
            .filter((goal) => goal.id !== excludedGoalId && goal.status !== "cancelled")
            .reduce((sum, goal) => sum + goal.weight, 0) + weight;
        if (total > 100.001) {
            throw new AppError(422, "PERFORMANCE_GOAL_WEIGHT_EXCEEDED",
                "A soma dos pesos das metas não pode ultrapassar 100.", { total });
        }
    }

    private requireGoal(assignment: EvaluationAssignmentDetail, goalId: string): PerformanceGoal {
        const goal = assignment.goals.find((item) => item.id === goalId);
        if (!goal) throw goalNotFound();
        return goal;
    }

    private assertRequestedDepartment(
        context: AuthenticationContext, departmentId?: string,
    ): void {
        if (departmentId && !isAdministrator(context) && departmentId !== context.departmentId) {
            throw new AppError(403, "EVALUATION_DEPARTMENT_SCOPE_DENIED",
                "Você só pode acessar avaliações do seu departamento.");
        }
    }

    private assertCanManageDepartment(
        context: AuthenticationContext, departmentId: string | null,
    ): void {
        if (isAdministrator(context)) return;
        if (departmentId !== context.departmentId) {
            throw new AppError(403, "EVALUATION_MANAGEMENT_SCOPE_DENIED",
                "Você só pode gerenciar ciclos do seu departamento.");
        }
    }

    private assertEmployeeScope(context: AuthenticationContext, employee: EvaluationEmployee): void {
        if (!isAdministrator(context) && employee.departmentId !== context.departmentId) {
            throw new AppError(403, "EVALUATION_EMPLOYEE_SCOPE_DENIED",
                "Você só pode avaliar colaboradores do seu departamento.");
        }
    }

    private async resolveDepartment(
        context: AuthenticationContext, requestedDepartmentId?: string | null,
    ): Promise<string | null> {
        if (!isAdministrator(context) && !requestedDepartmentId) return context.departmentId;
        if (!isAdministrator(context) && requestedDepartmentId !== context.departmentId) {
            throw new AppError(403, "EVALUATION_DEPARTMENT_SCOPE_DENIED",
                "Você só pode gerenciar avaliações do seu departamento.");
        }
        if (!requestedDepartmentId) return null;
        const department = await organizationRepository.findDepartment(
            context.companyId, requestedDepartmentId,
        );
        if (!department) throw new AppError(422, "EVALUATION_DEPARTMENT_NOT_FOUND",
            "O departamento informado não existe.");
        if (!department.active) throw new AppError(409, "EVALUATION_DEPARTMENT_INACTIVE",
            "O departamento informado está inativo.");
        return requestedDepartmentId;
    }

    private async requireActiveEmployee(
        context: AuthenticationContext, employeeId: string,
    ): Promise<EvaluationEmployee> {
        const employee = await evaluationAssignmentsRepository.findEmployee(
            context.companyId, employeeId,
        );
        if (!employee) throw new AppError(422, "EVALUATION_EMPLOYEE_NOT_FOUND",
            "O colaborador informado não existe.");
        if (employee.status !== "active") throw new AppError(409, "EVALUATION_EMPLOYEE_INACTIVE",
            "O colaborador informado não está ativo.");
        return employee;
    }
}

export const evaluationsService = new EvaluationsService();
