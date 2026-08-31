import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    trainingsRepository,
    type Training,
    type TrainingClass,
    type TrainingEnrollment,
    type TrainingExam,
    type TrainingExamQuestion,
} from "../repositories/trainings.repository.js";
import { organizationRepository, type AuditActor } from "../repositories/organization.repository.js";
import type {
    AssignTrainingEnrollmentsInput,
    CreateTrainingClassInput,
    CreateTrainingInput,
    MyTrainingListQuery,
    SubmitTrainingExamInput,
    TrainingClassListQuery,
    TrainingEnrollmentListQuery,
    TrainingListQuery,
    UpdateTrainingClassInput,
    UpdateTrainingInput,
    UpdateTrainingProgressInput,
    UpsertTrainingExamInput,
} from "../schemas/trainings.schemas.js";
import { hasDatabaseConstraint } from "../utils/database-errors.js";

const trainingNotFound = (): AppError => new AppError(
    404, "TRAINING_NOT_FOUND", "Treinamento não encontrado.",
);
const classNotFound = (): AppError => new AppError(
    404, "TRAINING_CLASS_NOT_FOUND", "Turma de treinamento não encontrada.",
);
const enrollmentNotFound = (): AppError => new AppError(
    404, "TRAINING_ENROLLMENT_NOT_FOUND", "Inscrição de treinamento não encontrada.",
);
const examNotFound = (): AppError => new AppError(
    404, "TRAINING_EXAM_NOT_FOUND", "Prova do treinamento não encontrada.",
);

const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);

export class TrainingsService {
    listTrainings(context: AuthenticationContext, query: TrainingListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return trainingsRepository.listTrainings(
            context.companyId,
            isAdministrator(context) ? undefined : context.departmentId,
            query,
        );
    }

    async getTraining(context: AuthenticationContext, trainingId: string): Promise<Training> {
        const training = await trainingsRepository.findTraining(
            context.companyId,
            trainingId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!training) throw trainingNotFound();
        return training;
    }

    async createTraining(
        context: AuthenticationContext,
        input: CreateTrainingInput,
        actor: AuditActor,
    ): Promise<Training> {
        const departmentId = await this.resolveDepartment(context, input.departmentId);
        try {
            const id = await trainingsRepository.createTraining(
                context.companyId, input, departmentId, actor,
            );
            return this.getTraining(context, id);
        } catch (error) {
            if (hasDatabaseConstraint(error, "trainings_code_per_company_unique")) {
                throw new AppError(
                    409, "TRAINING_CODE_ALREADY_EXISTS",
                    "Já existe um treinamento com este código.",
                );
            }
            throw error;
        }
    }

    async updateTraining(
        context: AuthenticationContext,
        trainingId: string,
        input: UpdateTrainingInput,
        actor: AuditActor,
    ): Promise<Training> {
        const current = await this.getTraining(context, trainingId);
        this.assertCanManageDepartment(context, current.departmentId);
        let departmentId: string | null | undefined;
        if (input.departmentId !== undefined) {
            departmentId = await this.resolveDepartment(context, input.departmentId);
        }
        try {
            if (!await trainingsRepository.updateTraining(
                context.companyId, trainingId, input, departmentId, actor,
            )) throw trainingNotFound();
            return this.getTraining(context, trainingId);
        } catch (error) {
            if (hasDatabaseConstraint(error, "trainings_code_per_company_unique")) {
                throw new AppError(
                    409, "TRAINING_CODE_ALREADY_EXISTS",
                    "Já existe um treinamento com este código.",
                );
            }
            throw error;
        }
    }

    async archiveTraining(
        context: AuthenticationContext,
        trainingId: string,
        actor: AuditActor,
    ): Promise<void> {
        const training = await this.getTraining(context, trainingId);
        this.assertCanManageDepartment(context, training.departmentId);
        const activeClasses = await trainingsRepository.countActiveClasses(
            context.companyId, trainingId,
        );
        if (activeClasses > 0) {
            throw new AppError(
                409, "TRAINING_HAS_ACTIVE_CLASSES",
                "O treinamento possui turmas ativas.", { activeClasses },
            );
        }
        if (!await trainingsRepository.archiveTraining(context.companyId, trainingId, actor)) {
            throw trainingNotFound();
        }
    }

    listClasses(context: AuthenticationContext, query: TrainingClassListQuery) {
        this.assertRequestedDepartment(context, query.departmentId);
        return trainingsRepository.listClasses(
            context.companyId,
            isAdministrator(context) ? undefined : context.departmentId,
            query,
        );
    }

    async getClass(context: AuthenticationContext, classId: string): Promise<TrainingClass> {
        const trainingClass = await trainingsRepository.findClass(
            context.companyId,
            classId,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (!trainingClass) throw classNotFound();
        return trainingClass;
    }

    async createClass(
        context: AuthenticationContext,
        trainingId: string,
        input: CreateTrainingClassInput,
        actor: AuditActor,
    ): Promise<TrainingClass> {
        const training = await this.getTraining(context, trainingId);
        this.assertCanManageDepartment(context, training.departmentId);
        if (training.status === "archived") {
            throw new AppError(
                409, "ARCHIVED_TRAINING_CLASS_DENIED",
                "Não é possível criar turma para um treinamento arquivado.",
            );
        }
        if (training.status !== "published" && input.status !== "draft") {
            throw new AppError(
                409, "TRAINING_MUST_BE_PUBLISHED",
                "Publique o treinamento antes de abrir a turma.",
            );
        }
        this.assertClassRange(input.startsAt, input.endsAt, input.enrollmentDeadline);
        const departmentId = await this.resolveClassDepartment(
            context, training, input.departmentId,
        );
        const id = await trainingsRepository.createClass(
            context, training, input, departmentId, actor,
        );
        return this.getClass(context, id);
    }

    async updateClass(
        context: AuthenticationContext,
        classId: string,
        input: UpdateTrainingClassInput,
        actor: AuditActor,
    ): Promise<TrainingClass> {
        const current = await this.getClass(context, classId);
        this.assertCanManageDepartment(context, current.departmentId);
        if (current.trainingStatus !== "published"
            && input.status && input.status !== "draft" && input.status !== "cancelled") {
            throw new AppError(
                409, "TRAINING_MUST_BE_PUBLISHED",
                "Publique o treinamento antes de abrir a turma.",
            );
        }
        const departmentId = input.departmentId === undefined
            ? current.departmentId
            : await this.resolveClassDepartment(
                context,
                await this.getTraining(context, current.trainingId),
                input.departmentId,
            );
        const resolved = {
            departmentId,
            name: input.name ?? current.name,
            status: input.status ?? current.status,
            startsAt: input.startsAt ?? current.startsAt.toISOString(),
            endsAt: input.endsAt ?? current.endsAt.toISOString(),
            enrollmentDeadline: input.enrollmentDeadline === undefined
                ? current.enrollmentDeadline?.toISOString() ?? null
                : input.enrollmentDeadline,
            capacity: input.capacity === undefined ? current.capacity : input.capacity,
            location: input.location === undefined ? current.location : input.location,
            meetingUrl: input.meetingUrl === undefined ? current.meetingUrl : input.meetingUrl,
        };
        this.assertClassRange(
            resolved.startsAt, resolved.endsAt, resolved.enrollmentDeadline,
        );
        if (resolved.capacity !== null && resolved.capacity < current.enrollmentCount) {
            throw new AppError(
                409, "TRAINING_CLASS_CAPACITY_BELOW_ENROLLMENTS",
                "A capacidade não pode ser menor que a quantidade de inscritos.",
                { enrollmentCount: current.enrollmentCount },
            );
        }
        if (!await trainingsRepository.updateClass(
            context.companyId, classId, current.trainingTitle,
            resolved, Object.keys(input), actor,
        )) throw classNotFound();
        return this.getClass(context, classId);
    }

    async archiveClass(
        context: AuthenticationContext,
        classId: string,
        actor: AuditActor,
    ): Promise<void> {
        const current = await this.getClass(context, classId);
        this.assertCanManageDepartment(context, current.departmentId);
        if (current.enrollmentCount > 0) {
            throw new AppError(
                409, "TRAINING_CLASS_HAS_ENROLLMENTS",
                "Cancele as inscrições antes de remover a turma.",
                { enrollmentCount: current.enrollmentCount },
            );
        }
        if (!await trainingsRepository.archiveClass(context.companyId, classId, actor)) {
            throw classNotFound();
        }
    }

    async assignEnrollments(
        context: AuthenticationContext,
        classId: string,
        input: AssignTrainingEnrollmentsInput,
        actor: AuditActor,
    ): Promise<{ assigned: number; requested: number }> {
        const trainingClass = await this.getClass(context, classId);
        this.assertCanManageDepartment(context, trainingClass.departmentId);
        if (!["draft", "open"].includes(trainingClass.status)) {
            throw new AppError(
                409, "TRAINING_CLASS_NOT_ACCEPTING_ENROLLMENTS",
                "A turma não está aceitando novas inscrições.",
            );
        }
        if (trainingClass.enrollmentDeadline
            && trainingClass.enrollmentDeadline.getTime() < Date.now()) {
            throw new AppError(
                409, "TRAINING_ENROLLMENT_DEADLINE_EXPIRED",
                "O prazo de inscrição desta turma terminou.",
            );
        }
        const employeeIds = await trainingsRepository.findActiveEmployeeIds(
            context.companyId,
            input.employeeIds,
            isAdministrator(context) ? undefined : context.departmentId,
        );
        if (employeeIds.length !== input.employeeIds.length) {
            const valid = new Set(employeeIds);
            throw new AppError(
                422, "INVALID_TRAINING_EMPLOYEES",
                "Um ou mais colaboradores não existem, estão inativos ou estão fora do seu departamento.",
                { invalidEmployeeIds: input.employeeIds.filter((id) => !valid.has(id)) },
            );
        }
        try {
            const assigned = await trainingsRepository.assignEnrollments(
                context.companyId, classId, employeeIds, actor,
            );
            return { assigned, requested: employeeIds.length };
        } catch (error) {
            if (error instanceof Error && error.name === "TrainingCapacityError") {
                throw new AppError(
                    409, "TRAINING_CLASS_CAPACITY_EXCEEDED",
                    "A quantidade de inscrições ultrapassa a capacidade da turma.",
                );
            }
            throw error;
        }
    }

    async listEnrollments(
        context: AuthenticationContext,
        classId: string,
        query: TrainingEnrollmentListQuery,
    ) {
        const trainingClass = await this.getClass(context, classId);
        this.assertCanManageDepartment(context, trainingClass.departmentId);
        return trainingsRepository.listEnrollments(context.companyId, classId, query);
    }

    async cancelEnrollment(
        context: AuthenticationContext,
        enrollmentId: string,
        actor: AuditActor,
    ): Promise<void> {
        const enrollment = await this.getManagedEnrollment(context, enrollmentId);
        if (enrollment.status === "completed") {
            throw new AppError(
                409, "COMPLETED_TRAINING_ENROLLMENT",
                "Uma inscrição concluída não pode ser cancelada.",
            );
        }
        if (!await trainingsRepository.cancelEnrollment(
            context.companyId, enrollmentId, actor,
        )) throw enrollmentNotFound();
    }

    listMyTrainings(context: AuthenticationContext, query: MyTrainingListQuery) {
        return trainingsRepository.listMyEnrollments(
            context.companyId, context.employeeId, query,
        );
    }

    async getMyTraining(
        context: AuthenticationContext,
        enrollmentId: string,
    ): Promise<TrainingEnrollment> {
        const enrollment = await trainingsRepository.findEnrollment(
            context.companyId, enrollmentId,
        );
        if (!enrollment || enrollment.employeeId !== context.employeeId) {
            throw enrollmentNotFound();
        }
        return enrollment;
    }

    async updateMyProgress(
        context: AuthenticationContext,
        enrollmentId: string,
        input: UpdateTrainingProgressInput,
        actor: AuditActor,
    ): Promise<TrainingEnrollment> {
        const enrollment = await this.getMyTraining(context, enrollmentId);
        if (["completed", "failed", "cancelled"].includes(enrollment.status)) {
            throw new AppError(
                409, "TRAINING_ENROLLMENT_IS_FINAL",
                "Esta inscrição não aceita novas atualizações de progresso.",
            );
        }
        if (enrollment.classStatus === "cancelled") {
            throw new AppError(
                409, "TRAINING_CLASS_CANCELLED",
                "A turma foi cancelada.",
            );
        }
        const complete = input.progressPercent === 100 && !enrollment.examId;
        if (!await trainingsRepository.updateProgress(
            context.companyId, enrollmentId, input.progressPercent, complete, actor,
        )) throw enrollmentNotFound();
        return this.getMyTraining(context, enrollmentId);
    }

    async getExam(context: AuthenticationContext, trainingId: string): Promise<TrainingExam> {
        await this.getTraining(context, trainingId);
        const exam = await trainingsRepository.findExam(context.companyId, trainingId);
        if (!exam) throw examNotFound();
        return exam;
    }

    async upsertExam(
        context: AuthenticationContext,
        trainingId: string,
        input: UpsertTrainingExamInput,
        actor: AuditActor,
    ): Promise<TrainingExam> {
        const training = await this.getTraining(context, trainingId);
        this.assertCanManageDepartment(context, training.departmentId);
        if (input.published && training.status !== "published") {
            throw new AppError(
                409, "TRAINING_MUST_BE_PUBLISHED",
                "Publique o treinamento antes de publicar a prova.",
            );
        }
        await trainingsRepository.upsertExam(context.companyId, trainingId, input, actor);
        return this.getExam(context, trainingId);
    }

    async getMyExam(
        context: AuthenticationContext,
        enrollmentId: string,
    ): Promise<Omit<TrainingExam, "questions"> & { questions: Array<Omit<TrainingExamQuestion, "options"> & {
        options: Array<Omit<TrainingExamQuestion["options"][number], "isCorrect">>;
    }> }> {
        const enrollment = await this.getMyTraining(context, enrollmentId);
        const exam = await trainingsRepository.findExam(context.companyId, enrollment.trainingId);
        if (!exam || !exam.published) throw examNotFound();
        if (enrollment.attemptCount >= exam.maxAttempts && enrollment.status !== "completed") {
            throw new AppError(
                409, "TRAINING_EXAM_ATTEMPTS_EXHAUSTED",
                "O limite de tentativas desta prova foi atingido.",
            );
        }
        return {
            ...exam,
            questions: exam.questions.map((question) => ({
                ...question,
                options: question.options.map(({ isCorrect: _isCorrect, ...option }) => option),
            })),
        };
    }

    async submitMyExam(
        context: AuthenticationContext,
        enrollmentId: string,
        input: SubmitTrainingExamInput,
        actor: AuditActor,
    ) {
        const enrollment = await this.getMyTraining(context, enrollmentId);
        if (["completed", "cancelled"].includes(enrollment.status)) {
            throw new AppError(
                409, "TRAINING_ENROLLMENT_IS_FINAL",
                "Esta inscrição não aceita novas tentativas.",
            );
        }
        const exam = await trainingsRepository.findExam(context.companyId, enrollment.trainingId);
        if (!exam || !exam.published) throw examNotFound();
        if (enrollment.attemptCount >= exam.maxAttempts) {
            throw new AppError(
                409, "TRAINING_EXAM_ATTEMPTS_EXHAUSTED",
                "O limite de tentativas desta prova foi atingido.",
            );
        }
        if (input.answers.length !== exam.questions.length) {
            throw new AppError(
                422, "TRAINING_EXAM_INCOMPLETE",
                "Responda todas as questões da prova.",
            );
        }
        const answerMap = new Map(input.answers.map((answer) => [answer.questionId, answer]));
        const unknownQuestion = input.answers.find(
            (answer) => !exam.questions.some((question) => question.id === answer.questionId),
        );
        if (unknownQuestion) {
            throw new AppError(
                422, "INVALID_TRAINING_EXAM_QUESTION",
                "Uma das questões informadas não pertence à prova.",
            );
        }

        const gradedAnswers = exam.questions.map((question) => {
            const answer = answerMap.get(question.id)!;
            const optionIds = new Set(question.options.map((option) => option.id));
            if (answer.selectedOptionIds.some((id) => !optionIds.has(id))) {
                throw new AppError(
                    422, "INVALID_TRAINING_EXAM_OPTION",
                    "Uma das alternativas informadas não pertence à questão.",
                );
            }
            const selected = [...answer.selectedOptionIds].sort();
            const correct = question.options.filter((option) => option.isCorrect)
                .map((option) => option.id).sort();
            const isCorrect = selected.length === correct.length
                && selected.every((id, index) => id === correct[index]);
            return {
                questionId: question.id,
                selectedOptionIds: answer.selectedOptionIds,
                correct: isCorrect,
                awardedPoints: isCorrect ? question.points : 0,
            };
        });
        const totalPoints = exam.questions.reduce((sum, question) => sum + question.points, 0);
        const awardedPoints = gradedAnswers.reduce((sum, answer) => sum + answer.awardedPoints, 0);
        const score = Math.round((awardedPoints / totalPoints) * 10_000) / 100;
        const passed = score >= exam.passingScore;
        try {
            const attempt = await trainingsRepository.recordAttempt(
                context.companyId, enrollmentId, exam, score, passed, gradedAnswers, actor,
            );
            return {
                attempt: {
                    id: attempt.id,
                    attemptNumber: attempt.attemptNumber,
                    score: attempt.score,
                    passed: attempt.passed,
                    submittedAt: attempt.submittedAt,
                },
                result: {
                    correctAnswers: gradedAnswers.filter((answer) => answer.correct).length,
                    totalQuestions: exam.questions.length,
                    passingScore: exam.passingScore,
                    attemptsRemaining: Math.max(0, exam.maxAttempts - attempt.attemptNumber),
                },
            };
        } catch (error) {
            if (error instanceof Error && error.name === "TrainingAttemptsError") {
                throw new AppError(
                    409, "TRAINING_EXAM_ATTEMPTS_EXHAUSTED",
                    "O limite de tentativas desta prova foi atingido.",
                );
            }
            throw error;
        }
    }

    getDashboardMetrics(context: AuthenticationContext) {
        return trainingsRepository.getDashboardMetrics(context);
    }

    private async getManagedEnrollment(
        context: AuthenticationContext,
        enrollmentId: string,
    ): Promise<TrainingEnrollment> {
        const enrollment = await trainingsRepository.findEnrollment(
            context.companyId, enrollmentId,
        );
        if (!enrollment) throw enrollmentNotFound();
        const trainingClass = await this.getClass(context, enrollment.classId);
        this.assertCanManageDepartment(context, trainingClass.departmentId);
        return enrollment;
    }

    private assertRequestedDepartment(
        context: AuthenticationContext,
        departmentId?: string,
    ): void {
        if (departmentId && !isAdministrator(context) && departmentId !== context.departmentId) {
            throw new AppError(
                403, "TRAINING_DEPARTMENT_SCOPE_DENIED",
                "Você só pode acessar treinamentos do seu departamento.",
            );
        }
    }

    private assertCanManageDepartment(
        context: AuthenticationContext,
        departmentId: string | null,
    ): void {
        if (isAdministrator(context)) return;
        if (departmentId !== context.departmentId) {
            throw new AppError(
                403, "TRAINING_MANAGEMENT_SCOPE_DENIED",
                "Você só pode gerenciar treinamentos do seu departamento.",
            );
        }
    }

    private async resolveDepartment(
        context: AuthenticationContext,
        requestedDepartmentId?: string | null,
    ): Promise<string | null> {
        if (!isAdministrator(context) && !requestedDepartmentId) {
            return context.departmentId;
        }
        if (!isAdministrator(context) && requestedDepartmentId !== context.departmentId) {
            throw new AppError(
                403, "TRAINING_DEPARTMENT_SCOPE_DENIED",
                "Você só pode gerenciar treinamentos do seu departamento.",
            );
        }
        if (!requestedDepartmentId) return null;
        const department = await organizationRepository.findDepartment(
            context.companyId, requestedDepartmentId,
        );
        if (!department) {
            throw new AppError(
                422, "TRAINING_DEPARTMENT_NOT_FOUND",
                "O departamento informado não existe.",
            );
        }
        if (!department.active) {
            throw new AppError(
                409, "TRAINING_DEPARTMENT_INACTIVE",
                "O departamento informado está inativo.",
            );
        }
        return requestedDepartmentId;
    }

    private async resolveClassDepartment(
        context: AuthenticationContext,
        training: Training,
        requestedDepartmentId?: string | null,
    ): Promise<string | null> {
        if (training.departmentId) {
            if (requestedDepartmentId && requestedDepartmentId !== training.departmentId) {
                throw new AppError(
                    422, "TRAINING_CLASS_DEPARTMENT_MISMATCH",
                    "A turma deve pertencer ao mesmo departamento do treinamento.",
                );
            }
            return training.departmentId;
        }
        return this.resolveDepartment(context, requestedDepartmentId);
    }

    private assertClassRange(
        startsAt: string,
        endsAt: string,
        enrollmentDeadline?: string | null,
    ): void {
        if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
            throw new AppError(
                422, "INVALID_TRAINING_CLASS_RANGE",
                "O término da turma deve ser posterior ao início.",
            );
        }
        if (enrollmentDeadline
            && new Date(enrollmentDeadline).getTime() > new Date(startsAt).getTime()) {
            throw new AppError(
                422, "INVALID_TRAINING_ENROLLMENT_DEADLINE",
                "O prazo de inscrição não pode ser posterior ao início da turma.",
            );
        }
    }
}

export const trainingsService = new TrainingsService();
