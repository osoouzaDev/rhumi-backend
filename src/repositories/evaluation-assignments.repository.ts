import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    EvaluationAssignmentListQuery,
    MyEvaluationListQuery,
    ScheduleEvaluationFeedbackInput,
    SubmitManagerReviewInput,
    SubmitSelfReviewInput,
    CreatePerformanceGoalInput,
    UpdatePerformanceGoalInput,
    UpdateMyPerformanceGoalInput,
} from "../schemas/evaluations.schemas.js";
import type { AuthenticationContext } from "./auth.repository.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface EvaluationEmployee {
    id: string;
    companyId: string;
    departmentId: string;
    fullName: string;
    email: string;
    status: "active" | "on_leave" | "inactive";
}

export interface EvaluationResponse {
    id: string;
    competencyId: string;
    competencyName: string;
    category: "behavioral" | "technical" | "leadership" | "cultural";
    weight: number;
    reviewerType: "self" | "manager";
    score: number;
    comment: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface PerformanceGoal {
    id: string;
    assignmentId: string;
    title: string;
    description: string;
    successCriteria: string;
    weight: number;
    targetDate: string;
    status: "not_started" | "in_progress" | "completed" | "cancelled";
    progressPercent: number;
    employeeNotes: string | null;
    managerNotes: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface EvaluationAssignment {
    id: string;
    companyId: string;
    cycleId: string;
    cycleCode: string;
    cycleName: string;
    cycleStatus: "draft" | "scheduled" | "active" | "completed" | "cancelled";
    cycleDepartmentId: string | null;
    startsOn: string;
    selfReviewDeadline: string;
    managerReviewDeadline: string;
    feedbackDeadline: string;
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    departmentId: string;
    departmentName: string;
    evaluatorEmployeeId: string;
    evaluatorName: string;
    status: "pending" | "self_review" | "manager_review" | "feedback_pending" | "completed" | "cancelled";
    selfScore: number | null;
    managerScore: number | null;
    finalScore: number | null;
    employeeSummary: string | null;
    strengths: string | null;
    improvementPoints: string | null;
    developmentActions: string | null;
    finalFeedback: string | null;
    feedbackEventId: string | null;
    selfSubmittedAt: Date | null;
    managerSubmittedAt: Date | null;
    feedbackCompletedAt: Date | null;
    goalCount: number;
    completedGoalCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface EvaluationAssignmentDetail extends EvaluationAssignment {
    responses: EvaluationResponse[];
    goals: PerformanceGoal[];
}

export interface EvaluationDashboardMetrics {
    activeCycles: number;
    myPendingReviews: number;
    awaitingManagerReview: number;
    completionRate: number;
}

interface AssignmentRow {
    id: string; company_id: string; cycle_id: string; cycle_code: string;
    cycle_name: string; cycle_status: EvaluationAssignment["cycleStatus"];
    cycle_department_id: string | null; starts_on: string;
    self_review_deadline: string; manager_review_deadline: string;
    feedback_deadline: string; employee_id: string; employee_name: string;
    employee_email: string; department_id: string; department_name: string;
    evaluator_employee_id: string; evaluator_name: string;
    status: EvaluationAssignment["status"]; self_score: string | null;
    manager_score: string | null; final_score: string | null;
    employee_summary: string | null; strengths: string | null;
    improvement_points: string | null; development_actions: string | null;
    final_feedback: string | null; feedback_event_id: string | null;
    self_submitted_at: Date | null; manager_submitted_at: Date | null;
    feedback_completed_at: Date | null; goal_count: number;
    completed_goal_count: number; created_at: Date; updated_at: Date; total?: number;
}

interface ResponseRow {
    id: string; competency_id: string; competency_name: string;
    category: EvaluationResponse["category"]; weight: string;
    reviewer_type: EvaluationResponse["reviewerType"]; score: string;
    comment: string | null; created_at: Date; updated_at: Date;
}

interface GoalRow {
    id: string; assignment_id: string; title: string; description: string;
    success_criteria: string; weight: string; target_date: string;
    status: PerformanceGoal["status"]; progress_percent: string;
    employee_notes: string | null; manager_notes: string | null;
    completed_at: Date | null; created_at: Date; updated_at: Date;
}

const assignmentColumns = `
    evaluation_assignments.id, evaluation_assignments.company_id,
    evaluation_assignments.cycle_id, evaluation_cycles.code AS cycle_code,
    evaluation_cycles.name AS cycle_name, evaluation_cycles.status AS cycle_status,
    evaluation_cycles.department_id AS cycle_department_id, evaluation_cycles.starts_on,
    evaluation_cycles.self_review_deadline, evaluation_cycles.manager_review_deadline,
    evaluation_cycles.feedback_deadline, evaluation_assignments.employee_id,
    employee.full_name AS employee_name, employee.email AS employee_email,
    employee.department_id, departments.name AS department_name,
    evaluation_assignments.evaluator_employee_id, evaluator.full_name AS evaluator_name,
    evaluation_assignments.status, evaluation_assignments.self_score,
    evaluation_assignments.manager_score, evaluation_assignments.final_score,
    evaluation_assignments.employee_summary, evaluation_assignments.strengths,
    evaluation_assignments.improvement_points, evaluation_assignments.development_actions,
    evaluation_assignments.final_feedback, evaluation_assignments.feedback_event_id,
    evaluation_assignments.self_submitted_at, evaluation_assignments.manager_submitted_at,
    evaluation_assignments.feedback_completed_at, evaluation_assignments.created_at,
    evaluation_assignments.updated_at,
    (SELECT COUNT(*)::INTEGER FROM performance_goals
     WHERE performance_goals.assignment_id = evaluation_assignments.id
       AND performance_goals.deleted_at IS NULL) AS goal_count,
    (SELECT COUNT(*)::INTEGER FROM performance_goals
     WHERE performance_goals.assignment_id = evaluation_assignments.id
       AND performance_goals.deleted_at IS NULL
       AND performance_goals.status = 'completed') AS completed_goal_count
`;

const assignmentJoins = `
    INNER JOIN evaluation_cycles ON evaluation_cycles.id = evaluation_assignments.cycle_id
    INNER JOIN employees AS employee ON employee.id = evaluation_assignments.employee_id
    INNER JOIN departments ON departments.id = employee.department_id
    INNER JOIN employees AS evaluator ON evaluator.id = evaluation_assignments.evaluator_employee_id
`;

const mapAssignment = (row: AssignmentRow): EvaluationAssignment => ({
    id: row.id, companyId: row.company_id, cycleId: row.cycle_id,
    cycleCode: row.cycle_code, cycleName: row.cycle_name, cycleStatus: row.cycle_status,
    cycleDepartmentId: row.cycle_department_id, startsOn: row.starts_on,
    selfReviewDeadline: row.self_review_deadline,
    managerReviewDeadline: row.manager_review_deadline,
    feedbackDeadline: row.feedback_deadline, employeeId: row.employee_id,
    employeeName: row.employee_name, employeeEmail: row.employee_email,
    departmentId: row.department_id, departmentName: row.department_name,
    evaluatorEmployeeId: row.evaluator_employee_id, evaluatorName: row.evaluator_name,
    status: row.status, selfScore: row.self_score === null ? null : Number(row.self_score),
    managerScore: row.manager_score === null ? null : Number(row.manager_score),
    finalScore: row.final_score === null ? null : Number(row.final_score),
    employeeSummary: row.employee_summary, strengths: row.strengths,
    improvementPoints: row.improvement_points, developmentActions: row.development_actions,
    finalFeedback: row.final_feedback, feedbackEventId: row.feedback_event_id,
    selfSubmittedAt: row.self_submitted_at, managerSubmittedAt: row.manager_submitted_at,
    feedbackCompletedAt: row.feedback_completed_at, goalCount: row.goal_count,
    completedGoalCount: row.completed_goal_count, createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapResponse = (row: ResponseRow): EvaluationResponse => ({
    id: row.id, competencyId: row.competency_id, competencyName: row.competency_name,
    category: row.category, weight: Number(row.weight), reviewerType: row.reviewer_type,
    score: Number(row.score), comment: row.comment, createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapGoal = (row: GoalRow): PerformanceGoal => ({
    id: row.id, assignmentId: row.assignment_id, title: row.title,
    description: row.description, successCriteria: row.success_criteria,
    weight: Number(row.weight), targetDate: row.target_date, status: row.status,
    progressPercent: Number(row.progress_percent), employeeNotes: row.employee_notes,
    managerNotes: row.manager_notes, completedAt: row.completed_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient, companyId: string, actor: AuditActor, event: string,
    entityType: "evaluation_assignment" | "performance_goal", entityId: string,
    context: Record<string, unknown> = {},
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
        [companyId, actor.userId, event, entityType, entityId,
            actor.requestId ?? null, JSON.stringify(context)],
    );
};

export class EvaluationAssignmentsRepository {
    async findEmployee(companyId: string, employeeId: string): Promise<EvaluationEmployee | null> {
        const result = await database.query<{
            id: string; company_id: string; department_id: string; full_name: string;
            email: string; status: EvaluationEmployee["status"];
        }>(
            `SELECT id, company_id, department_id, full_name, email, status
             FROM employees WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
            [companyId, employeeId],
        );
        const row = result.rows[0];
        return row ? { id: row.id, companyId: row.company_id,
            departmentId: row.department_id, fullName: row.full_name,
            email: row.email, status: row.status } : null;
    }

    async list(
        companyId: string, scopeDepartmentId: string | undefined,
        query: EvaluationAssignmentListQuery,
    ): Promise<PaginatedResult<EvaluationAssignment>> {
        const result = await database.query<AssignmentRow>(
            `SELECT ${assignmentColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM evaluation_assignments ${assignmentJoins}
             WHERE evaluation_assignments.company_id = $1
               AND evaluation_assignments.deleted_at IS NULL
               AND ($2::UUID IS NULL OR employee.department_id = $2)
               AND ($3::TEXT IS NULL OR employee.full_name ILIKE '%' || $3 || '%'
                    OR employee.email ILIKE '%' || $3 || '%'
                    OR evaluation_cycles.name ILIKE '%' || $3 || '%')
               AND ($4::UUID IS NULL OR evaluation_assignments.cycle_id = $4)
               AND ($5::UUID IS NULL OR evaluation_assignments.employee_id = $5)
               AND ($6::UUID IS NULL OR evaluation_assignments.evaluator_employee_id = $6)
               AND ($7::UUID IS NULL OR employee.department_id = $7)
               AND ($8::TEXT IS NULL OR evaluation_assignments.status::TEXT = $8)
             ORDER BY evaluation_assignments.updated_at DESC
             LIMIT $9 OFFSET $10`,
            [companyId, scopeDepartmentId ?? null, query.search ?? null,
                query.cycleId ?? null, query.employeeId ?? null,
                query.evaluatorEmployeeId ?? null, query.departmentId ?? null,
                query.status ?? null, query.pageSize, (query.page - 1) * query.pageSize],
        );
        return { items: result.rows.map(mapAssignment), total: result.rows[0]?.total ?? 0 };
    }

    async listMine(
        companyId: string, employeeId: string, query: MyEvaluationListQuery,
    ): Promise<PaginatedResult<EvaluationAssignment>> {
        const result = await database.query<AssignmentRow>(
            `SELECT ${assignmentColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM evaluation_assignments ${assignmentJoins}
             WHERE evaluation_assignments.company_id = $1
               AND evaluation_assignments.employee_id = $2
               AND evaluation_assignments.deleted_at IS NULL
               AND ($3::TEXT IS NULL OR evaluation_assignments.status::TEXT = $3)
             ORDER BY evaluation_assignments.created_at DESC
             LIMIT $4 OFFSET $5`,
            [companyId, employeeId, query.status ?? null, query.pageSize,
                (query.page - 1) * query.pageSize],
        );
        return { items: result.rows.map(mapAssignment), total: result.rows[0]?.total ?? 0 };
    }

    async findById(
        companyId: string, assignmentId: string, scopeDepartmentId?: string,
    ): Promise<EvaluationAssignmentDetail | null> {
        const result = await database.query<AssignmentRow>(
            `SELECT ${assignmentColumns}
             FROM evaluation_assignments ${assignmentJoins}
             WHERE evaluation_assignments.company_id = $1
               AND evaluation_assignments.id = $2
               AND evaluation_assignments.deleted_at IS NULL
               AND ($3::UUID IS NULL OR employee.department_id = $3)`,
            [companyId, assignmentId, scopeDepartmentId ?? null],
        );
        const row = result.rows[0];
        if (!row) return null;
        const [responses, goals] = await Promise.all([
            database.query<ResponseRow>(
                `SELECT evaluation_responses.id, evaluation_responses.competency_id,
                        evaluation_competencies.name AS competency_name,
                        evaluation_competencies.category, evaluation_competencies.weight,
                        evaluation_responses.reviewer_type, evaluation_responses.score,
                        evaluation_responses.comment, evaluation_responses.created_at,
                        evaluation_responses.updated_at
                 FROM evaluation_responses
                 INNER JOIN evaluation_competencies
                    ON evaluation_competencies.id = evaluation_responses.competency_id
                 WHERE evaluation_responses.assignment_id = $1
                 ORDER BY evaluation_competencies.position, evaluation_responses.reviewer_type`,
                [assignmentId],
            ),
            database.query<GoalRow>(
                `SELECT id, assignment_id, title, description, success_criteria, weight,
                        target_date, status, progress_percent, employee_notes, manager_notes,
                        completed_at, created_at, updated_at
                 FROM performance_goals
                 WHERE assignment_id = $1 AND deleted_at IS NULL
                 ORDER BY target_date, created_at`,
                [assignmentId],
            ),
        ]);
        return { ...mapAssignment(row), responses: responses.rows.map(mapResponse),
            goals: goals.rows.map(mapGoal) };
    }

    async findMine(
        companyId: string, employeeId: string, assignmentId: string,
    ): Promise<EvaluationAssignmentDetail | null> {
        const result = await this.findById(companyId, assignmentId);
        return result?.employeeId === employeeId ? result : null;
    }

    async assignParticipants(
        companyId: string, cycleId: string,
        participants: Array<{ employeeId: string; evaluatorEmployeeId: string }>,
        initialStatus: "pending" | "self_review", actor: AuditActor,
    ): Promise<string[]> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const ids: string[] = [];
            for (const participant of participants) {
                const result = await client.query<{ id: string }>(
                    `INSERT INTO evaluation_assignments (
                        company_id, cycle_id, employee_id, evaluator_employee_id,
                        status, created_by
                     ) VALUES ($1, $2, $3, $4, $5, $6)
                     ON CONFLICT (cycle_id, employee_id) WHERE deleted_at IS NULL DO NOTHING
                     RETURNING id`,
                    [companyId, cycleId, participant.employeeId,
                        participant.evaluatorEmployeeId, initialStatus, actor.userId],
                );
                if (result.rows[0]) ids.push(result.rows[0].id);
            }
            await addAuditLog(client, companyId, actor, "evaluation.participants.assigned",
                "evaluation_assignment", cycleId, { assignmentIds: ids });
            await client.query("COMMIT"); return ids;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async submitSelfReview(
        companyId: string, assignmentId: string, input: SubmitSelfReviewInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await this.replaceResponses(client, companyId, assignmentId, "self", input.responses,
                actor.userId);
            const score = await this.calculateReviewerScore(client, assignmentId, "self");
            const result = await client.query(
                `UPDATE evaluation_assignments
                 SET status = 'manager_review', self_score = $3,
                     employee_summary = $4, self_submitted_at = NOW()
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
                [companyId, assignmentId, score, input.employeeSummary ?? null],
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await addAuditLog(client, companyId, actor, "evaluation.self_review.submitted",
                "evaluation_assignment", assignmentId, { score });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async submitManagerReview(
        companyId: string, assignmentId: string, input: SubmitManagerReviewInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await this.replaceResponses(client, companyId, assignmentId, "manager",
                input.responses, actor.userId);
            const managerScore = await this.calculateReviewerScore(client, assignmentId, "manager");
            const result = await client.query(
                `UPDATE evaluation_assignments
                 SET status = 'feedback_pending', manager_score = $3,
                     final_score = ROUND((self_score * evaluation_cycles.self_weight
                         + $3 * evaluation_cycles.manager_weight) / 100, 2),
                     strengths = $4, improvement_points = $5, development_actions = $6,
                     manager_submitted_at = NOW()
                 FROM evaluation_cycles
                 WHERE evaluation_assignments.company_id = $1
                   AND evaluation_assignments.id = $2
                   AND evaluation_cycles.id = evaluation_assignments.cycle_id
                   AND evaluation_assignments.deleted_at IS NULL`,
                [companyId, assignmentId, managerScore, input.strengths,
                    input.improvementPoints, input.developmentActions],
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await addAuditLog(client, companyId, actor, "evaluation.manager_review.submitted",
                "evaluation_assignment", assignmentId, { managerScore });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    private async replaceResponses(
        client: PoolClient, companyId: string, assignmentId: string,
        reviewerType: "self" | "manager",
        responses: Array<{ competencyId: string; score: number; comment?: string | null }>,
        userId: string,
    ): Promise<void> {
        await client.query(
            "DELETE FROM evaluation_responses WHERE assignment_id = $1 AND reviewer_type = $2",
            [assignmentId, reviewerType],
        );
        for (const response of responses) {
            await client.query(
                `INSERT INTO evaluation_responses (
                    company_id, assignment_id, competency_id, reviewer_type,
                    score, comment, submitted_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [companyId, assignmentId, response.competencyId, reviewerType,
                    response.score, response.comment ?? null, userId],
            );
        }
    }

    private async calculateReviewerScore(
        client: PoolClient, assignmentId: string, reviewerType: "self" | "manager",
    ): Promise<number> {
        const result = await client.query<{ score: string }>(
            `SELECT ROUND(SUM(evaluation_responses.score * evaluation_competencies.weight) / 100, 2)
                AS score
             FROM evaluation_responses
             INNER JOIN evaluation_competencies
                ON evaluation_competencies.id = evaluation_responses.competency_id
             WHERE evaluation_responses.assignment_id = $1
               AND evaluation_responses.reviewer_type = $2`,
            [assignmentId, reviewerType],
        );
        return Number(result.rows[0]?.score ?? 0);
    }

    async scheduleFeedback(
        assignment: EvaluationAssignment, input: ScheduleEvaluationFeedbackInput,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            let eventId = assignment.feedbackEventId;
            if (eventId) {
                await client.query(
                    `UPDATE calendar_events
                     SET title = $2, description = $3, starts_at = $4, ends_at = $5,
                         location = $6, meeting_url = $7, status = 'scheduled', updated_by = $8
                     WHERE id = $1`,
                    [eventId, `Feedback ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${assignment.cycleName}`,
                        `ReuniÃƒÆ’Ã‚Â£o de feedback da avaliaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de ${assignment.employeeName}.`,
                        input.startsAt, input.endsAt, input.location ?? null,
                        input.meetingUrl ?? null, actor.userId],
                );
            } else {
                const result = await client.query<{ id: string }>(
                    `INSERT INTO calendar_events (
                        company_id, title, description, event_type, visibility, status,
                        location, meeting_url, starts_at, ends_at, all_day, timezone,
                        created_by, updated_by
                     ) VALUES ($1, $2, $3, 'evaluation', 'participants', 'scheduled',
                        $4, $5, $6, $7, FALSE, 'America/Cuiaba', $8, $8) RETURNING id`,
                    [assignment.companyId, `Feedback ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${assignment.cycleName}`,
                        `ReuniÃƒÆ’Ã‚Â£o de feedback da avaliaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o de ${assignment.employeeName}.`,
                        input.location ?? null, input.meetingUrl ?? null,
                        input.startsAt, input.endsAt, actor.userId],
                );
                eventId = result.rows[0]?.id ?? null;
                if (!eventId) throw new Error("Falha ao criar evento de feedback.");
                await client.query(
                    "UPDATE evaluation_assignments SET feedback_event_id = $1 WHERE id = $2",
                    [eventId, assignment.id],
                );
            }
            await client.query("DELETE FROM calendar_event_attendees WHERE event_id = $1", [eventId]);
            await client.query(
                `INSERT INTO calendar_event_attendees (event_id, employee_id)
                 SELECT $1, employee_id FROM UNNEST($2::UUID[]) employee_id`,
                [eventId, [...new Set([assignment.employeeId, assignment.evaluatorEmployeeId])]],
            );
            await addAuditLog(client, assignment.companyId, actor,
                "evaluation.feedback.scheduled", "evaluation_assignment", assignment.id,
                { eventId, startsAt: input.startsAt });
            await client.query("COMMIT"); return eventId;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async completeFeedback(
        companyId: string, assignmentId: string, finalFeedback: string, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ feedback_event_id: string | null }>(
                `UPDATE evaluation_assignments
                 SET status = 'completed', final_feedback = $3, feedback_completed_at = NOW()
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
                 RETURNING feedback_event_id`,
                [companyId, assignmentId, finalFeedback],
            );
            const row = result.rows[0];
            if (!row) { await client.query("ROLLBACK"); return false; }
            if (row.feedback_event_id) {
                await client.query(
                    "UPDATE calendar_events SET status = 'completed' WHERE id = $1",
                    [row.feedback_event_id],
                );
            }
            await addAuditLog(client, companyId, actor, "evaluation.feedback.completed",
                "evaluation_assignment", assignmentId);
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async createGoal(
        companyId: string, assignmentId: string, input: CreatePerformanceGoalInput,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO performance_goals (
                    company_id, assignment_id, title, description, success_criteria,
                    weight, target_date, manager_notes, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
                [companyId, assignmentId, input.title, input.description,
                    input.successCriteria, input.weight, input.targetDate,
                    input.managerNotes ?? null, actor.userId],
            );
            const id = result.rows[0]?.id;
            if (!id) throw new Error("Falha ao criar meta de desempenho.");
            await addAuditLog(client, companyId, actor, "performance_goal.created",
                "performance_goal", id, { assignmentId });
            await client.query("COMMIT"); return id;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async updateGoal(
        companyId: string, goalId: string, input: UpdatePerformanceGoalInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, goalId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if (input.title !== undefined) add("title", input.title);
            if (input.description !== undefined) add("description", input.description);
            if (input.successCriteria !== undefined) add("success_criteria", input.successCriteria);
            if (input.weight !== undefined) add("weight", input.weight);
            if (input.targetDate !== undefined) add("target_date", input.targetDate);
            if (input.status !== undefined && input.status !== "completed"
                && input.progressPercent !== 100) add("status", input.status);
            if (input.progressPercent !== undefined && input.progressPercent !== 100
                && input.status !== "completed") {
                add("progress_percent", input.progressPercent);
            }
            if (input.employeeNotes !== undefined) add("employee_notes", input.employeeNotes);
            if (input.managerNotes !== undefined) add("manager_notes", input.managerNotes);
            if (input.status === "completed" || input.progressPercent === 100) {
                add("status", "completed"); add("progress_percent", 100); add("completed_at", new Date());
            }
            const result = await client.query(
                `UPDATE performance_goals SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await addAuditLog(client, companyId, actor, "performance_goal.updated",
                "performance_goal", goalId, { changedFields: Object.keys(input) });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async updateMyGoal(
        companyId: string, goalId: string, input: UpdateMyPerformanceGoalInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const status = input.progressPercent === 100 ? "completed"
            : input.progressPercent > 0 ? "in_progress" : "not_started";
        return this.updateGoal(companyId, goalId, {
            progressPercent: input.progressPercent, employeeNotes: input.employeeNotes,
            status,
        }, actor);
    }

    async archiveGoal(companyId: string, goalId: string, actor: AuditActor): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `UPDATE performance_goals
                 SET status = 'cancelled', deleted_at = NOW()
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
                [companyId, goalId],
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await addAuditLog(client, companyId, actor, "performance_goal.archived",
                "performance_goal", goalId);
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async cancelAssignment(
        companyId: string, assignmentId: string, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ feedback_event_id: string | null }>(
                `UPDATE evaluation_assignments
                 SET status = 'cancelled', cancelled_at = NOW()
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL
                 RETURNING feedback_event_id`,
                [companyId, assignmentId],
            );
            const row = result.rows[0];
            if (!row) { await client.query("ROLLBACK"); return false; }
            if (row.feedback_event_id) {
                await client.query(
                    "UPDATE calendar_events SET status = 'cancelled' WHERE id = $1",
                    [row.feedback_event_id],
                );
            }
            await addAuditLog(client, companyId, actor, "evaluation.assignment.cancelled",
                "evaluation_assignment", assignmentId);
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async getDashboardMetrics(context: AuthenticationContext): Promise<EvaluationDashboardMetrics> {
        const admin = context.roles.includes("administrator");
        const result = await database.query<{
            active_cycles: number; my_pending_reviews: number;
            awaiting_manager_review: number; completion_rate: string;
        }>(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM evaluation_cycles
                 WHERE company_id = $1 AND deleted_at IS NULL AND status = 'active'
                   AND ($2::BOOLEAN OR department_id IS NULL OR department_id = $3)) AS active_cycles,
                COUNT(*) FILTER (WHERE evaluation_assignments.employee_id = $4
                    AND evaluation_assignments.status IN ('pending', 'self_review'))::INTEGER
                    AS my_pending_reviews,
                COUNT(*) FILTER (WHERE evaluation_assignments.evaluator_employee_id = $4
                    AND evaluation_assignments.status = 'manager_review')::INTEGER
                    AS awaiting_manager_review,
                COALESCE(ROUND(100.0 * COUNT(*) FILTER (
                    WHERE evaluation_assignments.status = 'completed'
                        AND ($2::BOOLEAN OR employee.department_id = $3))
                    / NULLIF(COUNT(*) FILTER (
                        WHERE evaluation_assignments.status <> 'cancelled'
                          AND ($2::BOOLEAN OR employee.department_id = $3)), 0), 2), 0)
                    AS completion_rate
             FROM evaluation_assignments
             INNER JOIN employees AS employee ON employee.id = evaluation_assignments.employee_id
             WHERE evaluation_assignments.company_id = $1
               AND evaluation_assignments.deleted_at IS NULL`,
            [context.companyId, admin, context.departmentId, context.employeeId],
        );
        const row = result.rows[0];
        return { activeCycles: row?.active_cycles ?? 0,
            myPendingReviews: row?.my_pending_reviews ?? 0,
            awaitingManagerReview: row?.awaiting_manager_review ?? 0,
            completionRate: Number(row?.completion_rate ?? 0) };
    }
}

export const evaluationAssignmentsRepository = new EvaluationAssignmentsRepository();






