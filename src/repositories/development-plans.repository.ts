import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { AuthenticationContext } from "./auth.repository.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    CreateDevelopmentPlanInput,
    DevelopmentPlanListQuery,
    MyDevelopmentPlanListQuery,
    UpdateDevelopmentActionInput,
    UpdateDevelopmentPlanInput,
    UpdateMyDevelopmentActionInput,
} from "../schemas/development.schemas.js";

export interface DevelopmentAction {
    id: string;
    objectiveId: string;
    responsibleEmployeeId: string;
    responsibleEmployeeName: string;
    actionType: "training" | "mentoring" | "project" | "course" | "reading" | "other";
    title: string;
    description: string;
    dueAt: Date;
    status: "not_started" | "in_progress" | "completed" | "blocked" | "cancelled";
    progressPercent: number;
    isOverdue: boolean;
    trainingId: string | null;
    trainingTitle: string | null;
    trainingEnrollmentId: string | null;
    calendarEventId: string | null;
    meetingEndsAt: Date | null;
    resourceUrl: string | null;
    employeeNotes: string | null;
    managerNotes: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface DevelopmentObjective {
    id: string;
    title: string;
    description: string;
    successCriteria: string;
    weight: number;
    targetDate: string;
    status: DevelopmentAction["status"];
    progressPercent: number;
    position: number;
    actions: DevelopmentAction[];
}

export interface DevelopmentPlan {
    id: string;
    companyId: string;
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    departmentId: string;
    departmentName: string;
    managerEmployeeId: string;
    managerName: string;
    evaluationAssignmentId: string | null;
    evaluationCycleName: string | null;
    targetCareerLevelId: string | null;
    targetCareerLevelName: string | null;
    title: string;
    description: string;
    focusAreas: string;
    status: "draft" | "active" | "completed" | "overdue" | "cancelled";
    startsOn: string;
    targetEndOn: string;
    progressPercent: number;
    objectiveCount: number;
    actionCount: number;
    pendingActionCount: number;
    objectives: DevelopmentObjective[];
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    cancelledAt: Date | null;
}

export interface DevelopmentDashboardMetrics {
    publishedCareerTracks: number;
    activePlans: number;
    overduePlans: number;
    myPendingActions: number;
}

interface PlanRow {
    id: string; company_id: string; employee_id: string; employee_name: string;
    employee_email: string; department_id: string; department_name: string;
    manager_employee_id: string; manager_name: string;
    evaluation_assignment_id: string | null; evaluation_cycle_name: string | null;
    target_career_level_id: string | null; target_career_level_name: string | null;
    title: string; description: string; focus_areas: string; status: DevelopmentPlan["status"];
    starts_on: string; target_end_on: string; progress_percent: string;
    objective_count: number; action_count: number; pending_action_count: number;
    created_at: Date; updated_at: Date; completed_at: Date | null;
    cancelled_at: Date | null; total?: number;
}

interface ObjectiveRow {
    id: string; title: string; description: string; success_criteria: string;
    weight: string; target_date: string; status: DevelopmentObjective["status"];
    progress_percent: string; position: number;
}

interface ActionRow {
    id: string; objective_id: string; responsible_employee_id: string;
    responsible_employee_name: string; action_type: DevelopmentAction["actionType"];
    title: string; description: string; due_at: Date; status: DevelopmentAction["status"];
    progress_percent: string; is_overdue: boolean; training_id: string | null;
    training_title: string | null; training_enrollment_id: string | null;
    calendar_event_id: string | null; meeting_ends_at: Date | null;
    resource_url: string | null; employee_notes: string | null;
    manager_notes: string | null; completed_at: Date | null;
    created_at: Date; updated_at: Date;
}

const planColumns = `
    development_plans.id, development_plans.company_id, development_plans.employee_id,
    employee.full_name AS employee_name, employee.email AS employee_email,
    employee.department_id, departments.name AS department_name,
    development_plans.manager_employee_id, manager.full_name AS manager_name,
    development_plans.evaluation_assignment_id, evaluation_cycles.name AS evaluation_cycle_name,
    development_plans.target_career_level_id,
    career_levels.name AS target_career_level_name, development_plans.title,
    development_plans.description, development_plans.focus_areas, development_plans.status,
    development_plans.starts_on, development_plans.target_end_on,
    development_plans.progress_percent, development_plans.created_at,
    development_plans.updated_at, development_plans.completed_at,
    development_plans.cancelled_at,
    (SELECT COUNT(*)::INTEGER FROM development_objectives
     WHERE development_objectives.plan_id = development_plans.id) AS objective_count,
    (SELECT COUNT(*)::INTEGER FROM development_actions
     INNER JOIN development_objectives ON development_objectives.id = development_actions.objective_id
     WHERE development_objectives.plan_id = development_plans.id) AS action_count,
    (SELECT COUNT(*)::INTEGER FROM development_actions
     INNER JOIN development_objectives ON development_objectives.id = development_actions.objective_id
     WHERE development_objectives.plan_id = development_plans.id
       AND development_actions.status NOT IN ('completed', 'cancelled')) AS pending_action_count
`;

const planJoins = `
    INNER JOIN employees AS employee ON employee.id = development_plans.employee_id
    INNER JOIN departments ON departments.id = employee.department_id
    INNER JOIN employees AS manager ON manager.id = development_plans.manager_employee_id
    LEFT JOIN evaluation_assignments
        ON evaluation_assignments.id = development_plans.evaluation_assignment_id
    LEFT JOIN evaluation_cycles ON evaluation_cycles.id = evaluation_assignments.cycle_id
    LEFT JOIN career_levels ON career_levels.id = development_plans.target_career_level_id
`;

const mapPlan = (row: PlanRow, objectives: DevelopmentObjective[] = []): DevelopmentPlan => ({
    id: row.id, companyId: row.company_id, employeeId: row.employee_id,
    employeeName: row.employee_name, employeeEmail: row.employee_email,
    departmentId: row.department_id, departmentName: row.department_name,
    managerEmployeeId: row.manager_employee_id, managerName: row.manager_name,
    evaluationAssignmentId: row.evaluation_assignment_id,
    evaluationCycleName: row.evaluation_cycle_name,
    targetCareerLevelId: row.target_career_level_id,
    targetCareerLevelName: row.target_career_level_name, title: row.title,
    description: row.description, focusAreas: row.focus_areas, status: row.status,
    startsOn: row.starts_on, targetEndOn: row.target_end_on,
    progressPercent: Number(row.progress_percent), objectiveCount: row.objective_count,
    actionCount: row.action_count, pendingActionCount: row.pending_action_count,
    objectives, createdAt: row.created_at, updatedAt: row.updated_at,
    completedAt: row.completed_at, cancelledAt: row.cancelled_at,
});

const mapAction = (row: ActionRow): DevelopmentAction => ({
    id: row.id, objectiveId: row.objective_id,
    responsibleEmployeeId: row.responsible_employee_id,
    responsibleEmployeeName: row.responsible_employee_name, actionType: row.action_type,
    title: row.title, description: row.description, dueAt: row.due_at,
    status: row.status, progressPercent: Number(row.progress_percent),
    isOverdue: row.is_overdue, trainingId: row.training_id,
    trainingTitle: row.training_title, trainingEnrollmentId: row.training_enrollment_id,
    calendarEventId: row.calendar_event_id, meetingEndsAt: row.meeting_ends_at,
    resourceUrl: row.resource_url, employeeNotes: row.employee_notes,
    managerNotes: row.manager_notes, completedAt: row.completed_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient, companyId: string, actor: AuditActor, event: string,
    entityType: "development_plan" | "development_action", entityId: string,
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

const refreshPlan = async (client: PoolClient, planId: string): Promise<void> => {
    await client.query(
        `UPDATE development_actions
         SET status = 'completed', progress_percent = 100,
             completed_at = COALESCE(development_actions.completed_at,
                training_enrollments.completed_at), updated_at = NOW()
         FROM training_enrollments, development_objectives
         WHERE development_actions.training_enrollment_id = training_enrollments.id
           AND development_actions.objective_id = development_objectives.id
           AND development_objectives.plan_id = $1
           AND training_enrollments.status = 'completed'
           AND development_actions.status <> 'completed'`,
        [planId],
    );
    await client.query(
        `WITH action_progress AS (
            SELECT development_objectives.id,
                   COALESCE(AVG(development_actions.progress_percent)
                       FILTER (WHERE development_actions.status <> 'cancelled'), 0) AS progress,
                   COUNT(*) FILTER (WHERE development_actions.status <> 'cancelled') AS total,
                   COUNT(*) FILTER (WHERE development_actions.status = 'completed') AS completed
            FROM development_objectives
            LEFT JOIN development_actions ON development_actions.objective_id = development_objectives.id
            WHERE development_objectives.plan_id = $1
            GROUP BY development_objectives.id
         )
         UPDATE development_objectives
         SET progress_percent = ROUND(action_progress.progress, 2),
             status = CASE
                WHEN action_progress.total > 0 AND action_progress.completed = action_progress.total
                    THEN 'completed'::development_item_status
                WHEN action_progress.progress > 0 THEN 'in_progress'::development_item_status
                ELSE 'not_started'::development_item_status END
         FROM action_progress WHERE development_objectives.id = action_progress.id`,
        [planId],
    );
    await client.query(
        `WITH objective_progress AS (
            SELECT COALESCE(SUM(progress_percent * weight) / 100, 0) AS progress,
                   COUNT(*) AS total,
                   COUNT(*) FILTER (WHERE status = 'completed') AS completed
            FROM development_objectives WHERE plan_id = $1
         )
         UPDATE development_plans
         SET progress_percent = ROUND(objective_progress.progress, 2),
             status = CASE
                WHEN development_plans.status = 'cancelled'
                    THEN 'cancelled'::development_plan_status
                WHEN development_plans.status = 'draft'
                    THEN 'draft'::development_plan_status
                WHEN objective_progress.total > 0
                    AND objective_progress.completed = objective_progress.total
                    THEN 'completed'::development_plan_status
                WHEN development_plans.target_end_on < CURRENT_DATE
                    THEN 'overdue'::development_plan_status
                ELSE 'active'::development_plan_status END,
             completed_at = CASE WHEN objective_progress.total > 0
                    AND objective_progress.completed = objective_progress.total
                    THEN COALESCE(development_plans.completed_at, NOW()) ELSE NULL END
         FROM objective_progress WHERE development_plans.id = $1`,
        [planId],
    );
    await client.query(
        `UPDATE employee_career_profiles
         SET readiness_percent = development_plans.progress_percent
         FROM development_plans
         WHERE development_plans.id = $1
           AND employee_career_profiles.employee_id = development_plans.employee_id
           AND employee_career_profiles.target_level_id = development_plans.target_career_level_id
           AND development_plans.target_career_level_id IS NOT NULL`,
        [planId],
    );
};

export class DevelopmentPlansRepository {
    async list(
        companyId: string, scopeDepartmentId: string | undefined,
        query: DevelopmentPlanListQuery,
    ): Promise<PaginatedResult<DevelopmentPlan>> {
        const result = await database.query<PlanRow>(
            `SELECT ${planColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM development_plans ${planJoins}
             WHERE development_plans.company_id = $1 AND development_plans.deleted_at IS NULL
               AND ($2::UUID IS NULL OR employee.department_id = $2)
               AND ($3::TEXT IS NULL OR development_plans.title ILIKE '%' || $3 || '%'
                    OR employee.full_name ILIKE '%' || $3 || '%')
               AND ($4::UUID IS NULL OR development_plans.employee_id = $4)
               AND ($5::UUID IS NULL OR development_plans.manager_employee_id = $5)
               AND ($6::UUID IS NULL OR employee.department_id = $6)
               AND ($7::TEXT IS NULL OR development_plans.status::TEXT = $7)
             ORDER BY development_plans.updated_at DESC
             LIMIT $8 OFFSET $9`,
            [companyId, scopeDepartmentId ?? null, query.search ?? null,
                query.employeeId ?? null, query.managerEmployeeId ?? null,
                query.departmentId ?? null, query.status ?? null, query.pageSize,
                (query.page - 1) * query.pageSize],
        );
        return { items: result.rows.map((row) => mapPlan(row)),
            total: result.rows[0]?.total ?? 0 };
    }

    async listMine(
        companyId: string, employeeId: string, query: MyDevelopmentPlanListQuery,
    ): Promise<PaginatedResult<DevelopmentPlan>> {
        const ids = await database.query<{ id: string }>(
            `SELECT id FROM development_plans
             WHERE company_id = $1 AND employee_id = $2 AND deleted_at IS NULL`,
            [companyId, employeeId],
        );
        await Promise.all(ids.rows.map(({ id }) => this.refresh(id)));
        const result = await database.query<PlanRow>(
            `SELECT ${planColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM development_plans ${planJoins}
             WHERE development_plans.company_id = $1
               AND development_plans.employee_id = $2
               AND development_plans.deleted_at IS NULL
               AND development_plans.status <> 'draft'
               AND ($3::TEXT IS NULL OR development_plans.status::TEXT = $3)
             ORDER BY development_plans.created_at DESC LIMIT $4 OFFSET $5`,
            [companyId, employeeId, query.status ?? null, query.pageSize,
                (query.page - 1) * query.pageSize],
        );
        return { items: result.rows.map((row) => mapPlan(row)),
            total: result.rows[0]?.total ?? 0 };
    }

    async findById(
        companyId: string, planId: string, scopeDepartmentId?: string,
    ): Promise<DevelopmentPlan | null> {
        await this.refresh(planId);
        const result = await database.query<PlanRow>(
            `SELECT ${planColumns} FROM development_plans ${planJoins}
             WHERE development_plans.company_id = $1 AND development_plans.id = $2
               AND development_plans.deleted_at IS NULL
               AND ($3::UUID IS NULL OR employee.department_id = $3)`,
            [companyId, planId, scopeDepartmentId ?? null],
        );
        const row = result.rows[0];
        if (!row) return null;
        const [objectives, actions] = await Promise.all([
            database.query<ObjectiveRow>(
                `SELECT id, title, description, success_criteria, weight, target_date,
                        status, progress_percent, position
                 FROM development_objectives WHERE plan_id = $1 ORDER BY position`, [planId]),
            database.query<ActionRow>(
                `SELECT development_actions.id, development_actions.objective_id,
                        development_actions.responsible_employee_id,
                        responsible.full_name AS responsible_employee_name,
                        development_actions.action_type, development_actions.title,
                        development_actions.description, development_actions.due_at,
                        development_actions.status, development_actions.progress_percent,
                        (development_actions.status NOT IN ('completed', 'cancelled')
                            AND development_actions.due_at < NOW()) AS is_overdue,
                        development_actions.training_id, trainings.title AS training_title,
                        development_actions.training_enrollment_id,
                        development_actions.calendar_event_id,
                        development_actions.meeting_ends_at, development_actions.resource_url,
                        development_actions.employee_notes, development_actions.manager_notes,
                        development_actions.completed_at, development_actions.created_at,
                        development_actions.updated_at
                 FROM development_actions
                 INNER JOIN development_objectives
                    ON development_objectives.id = development_actions.objective_id
                 INNER JOIN employees AS responsible
                    ON responsible.id = development_actions.responsible_employee_id
                 LEFT JOIN trainings ON trainings.id = development_actions.training_id
                 WHERE development_objectives.plan_id = $1
                 ORDER BY development_objectives.position, development_actions.created_at`, [planId]),
        ]);
        return mapPlan(row, objectives.rows.map((objective) => ({
            id: objective.id, title: objective.title, description: objective.description,
            successCriteria: objective.success_criteria, weight: Number(objective.weight),
            targetDate: objective.target_date, status: objective.status,
            progressPercent: Number(objective.progress_percent), position: objective.position,
            actions: actions.rows.filter((action) => action.objective_id === objective.id)
                .map(mapAction),
        })));
    }

    async findMine(companyId: string, employeeId: string, planId: string) {
        const plan = await this.findById(companyId, planId);
        return plan?.employeeId === employeeId && plan.status !== "draft" ? plan : null;
    }

    async create(
        context: AuthenticationContext, input: CreateDevelopmentPlanInput,
        managerEmployeeId: string, actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO development_plans (
                    company_id, employee_id, manager_employee_id, evaluation_assignment_id,
                    target_career_level_id, title, description, focus_areas, status,
                    starts_on, target_end_on, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                 RETURNING id`,
                [context.companyId, input.employeeId, managerEmployeeId,
                    input.evaluationAssignmentId ?? null, input.targetCareerLevelId ?? null,
                    input.title, input.description, input.focusAreas, input.status,
                    input.startsOn, input.targetEndOn, actor.userId],
            );
            const planId = result.rows[0]?.id;
            if (!planId) throw new Error("Falha ao criar PDI.");
            for (const [index, objective] of input.objectives.entries()) {
                const objectiveResult = await client.query<{ id: string }>(
                    `INSERT INTO development_objectives (
                        plan_id, title, description, success_criteria, weight,
                        target_date, position
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
                    [planId, objective.title, objective.description,
                        objective.successCriteria, objective.weight, objective.targetDate, index + 1],
                );
                const objectiveId = objectiveResult.rows[0]?.id;
                if (!objectiveId) throw new Error("Falha ao criar objetivo do PDI.");
                for (const action of objective.actions) {
                    const responsibleId = action.responsibleEmployeeId ?? input.employeeId;
                    const actionResult = await client.query<{ id: string }>(
                        `INSERT INTO development_actions (
                            company_id, objective_id, responsible_employee_id, action_type,
                            title, description, due_at, training_id, meeting_ends_at,
                            resource_url, manager_notes
                         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                         RETURNING id`,
                        [context.companyId, objectiveId, responsibleId, action.actionType,
                            action.title, action.description, action.dueAt,
                            action.trainingId ?? null, action.meetingEndsAt ?? null,
                            action.resourceUrl ?? null, action.managerNotes ?? null],
                    );
                    const actionId = actionResult.rows[0]?.id;
                    if (!actionId) throw new Error("Falha ao criar aÃ§Ã£o do PDI.");
                    if (action.actionType === "training" && action.trainingId) {
                        await this.linkTraining(client, context.companyId, input.employeeId,
                            action.trainingId, input.startsOn, actionId, actor.userId);
                    }
                    if (action.actionType === "mentoring" && action.meetingEndsAt) {
                        await this.createMentoringEvent(client, context, planId, input,
                            managerEmployeeId, responsibleId, actionId, action.title,
                            action.description, action.dueAt, action.meetingEndsAt, actor.userId);
                    }
                }
            }
            await refreshPlan(client, planId);
            await addAuditLog(client, context.companyId, actor, "development.plan.created",
                "development_plan", planId, { employeeId: input.employeeId });
            await client.query("COMMIT"); return planId;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    private async linkTraining(
        client: PoolClient, companyId: string, employeeId: string, trainingId: string,
        startsOn: string, actionId: string, userId: string,
    ): Promise<void> {
        const classResult = await client.query<{ id: string; calendar_event_id: string | null }>(
            `SELECT training_classes.id, training_classes.calendar_event_id
             FROM training_classes INNER JOIN employees ON employees.id = $2
             WHERE training_classes.company_id = $1 AND training_classes.training_id = $3
               AND training_classes.status = 'open' AND training_classes.deleted_at IS NULL
               AND training_classes.starts_at >= $4::DATE
               AND (training_classes.enrollment_deadline IS NULL
                    OR training_classes.enrollment_deadline >= NOW())
               AND (training_classes.department_id IS NULL
                    OR training_classes.department_id = employees.department_id)
               AND (training_classes.capacity IS NULL OR training_classes.capacity > (
                    SELECT COUNT(*) FROM training_enrollments
                    WHERE class_id = training_classes.id AND deleted_at IS NULL
                      AND status <> 'cancelled'))
             ORDER BY training_classes.starts_at LIMIT 1 FOR UPDATE OF training_classes`,
            [companyId, employeeId, trainingId, startsOn],
        );
        const trainingClass = classResult.rows[0];
        if (!trainingClass) return;
        await client.query(
            `INSERT INTO training_enrollments (company_id, class_id, employee_id, enrolled_by)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (class_id, employee_id) WHERE deleted_at IS NULL DO NOTHING`,
            [companyId, trainingClass.id, employeeId, userId],
        );
        const enrollment = await client.query<{ id: string }>(
            `SELECT id FROM training_enrollments
             WHERE class_id = $1 AND employee_id = $2 AND deleted_at IS NULL`,
            [trainingClass.id, employeeId],
        );
        if (enrollment.rows[0]) {
            await client.query(
                "UPDATE development_actions SET training_enrollment_id = $1 WHERE id = $2",
                [enrollment.rows[0].id, actionId],
            );
        }
        if (trainingClass.calendar_event_id) {
            await client.query(
                `INSERT INTO calendar_event_attendees (event_id, employee_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [trainingClass.calendar_event_id, employeeId],
            );
        }
    }

    private async createMentoringEvent(
        client: PoolClient, context: AuthenticationContext, planId: string,
        input: CreateDevelopmentPlanInput, managerEmployeeId: string,
        responsibleId: string, actionId: string, title: string, description: string,
        startsAt: string, endsAt: string, userId: string,
    ): Promise<void> {
        const result = await client.query<{ id: string }>(
            `INSERT INTO calendar_events (
                company_id, title, description, event_type, visibility, status,
                starts_at, ends_at, all_day, timezone, created_by, updated_by
             ) VALUES ($1, $2, $3, 'meeting', 'participants', 'scheduled',
                $4, $5, FALSE, 'America/Cuiaba', $6, $6) RETURNING id`,
            [context.companyId, `PDI â€” ${title}`,
                `${description}\n\nPlano: ${input.title}`, startsAt, endsAt, userId],
        );
        const eventId = result.rows[0]?.id;
        if (!eventId) throw new Error("Falha ao criar mentoria no calendÃ¡rio.");
        await client.query(
            `INSERT INTO calendar_event_attendees (event_id, employee_id)
             SELECT $1, employee_id FROM UNNEST($2::UUID[]) employee_id
             ON CONFLICT DO NOTHING`,
            [eventId, [...new Set([input.employeeId, managerEmployeeId, responsibleId])]],
        );
        await client.query("UPDATE development_actions SET calendar_event_id = $1 WHERE id = $2",
            [eventId, actionId]);
        void planId;
    }

    async updatePlan(
        companyId: string, planId: string, input: UpdateDevelopmentPlanInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, planId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if (input.managerEmployeeId !== undefined) add("manager_employee_id", input.managerEmployeeId);
            if (input.targetCareerLevelId !== undefined) add("target_career_level_id", input.targetCareerLevelId);
            if (input.title !== undefined) add("title", input.title);
            if (input.description !== undefined) add("description", input.description);
            if (input.focusAreas !== undefined) add("focus_areas", input.focusAreas);
            if (input.status !== undefined) add("status", input.status);
            if (input.startsOn !== undefined) add("starts_on", input.startsOn);
            if (input.targetEndOn !== undefined) add("target_end_on", input.targetEndOn);
            if (input.status === "cancelled") add("cancelled_at", new Date());
            const result = await client.query(
                `UPDATE development_plans SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            if (input.status === "cancelled") {
                await client.query(
                    `UPDATE calendar_events SET status = 'cancelled'
                     WHERE id IN (SELECT development_actions.calendar_event_id
                        FROM development_actions INNER JOIN development_objectives
                            ON development_objectives.id = development_actions.objective_id
                        WHERE development_objectives.plan_id = $1
                          AND development_actions.calendar_event_id IS NOT NULL)`, [planId]);
            }
            await refreshPlan(client, planId);
            await addAuditLog(client, companyId, actor, "development.plan.updated",
                "development_plan", planId, { changedFields: Object.keys(input) });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async updateAction(
        companyId: string, planId: string, actionId: string,
        input: UpdateDevelopmentActionInput | UpdateMyDevelopmentActionInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, actionId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if ("responsibleEmployeeId" in input && input.responsibleEmployeeId !== undefined) {
                add("responsible_employee_id", input.responsibleEmployeeId);
            }
            if ("status" in input && input.status !== undefined
                && input.status !== "completed" && input.progressPercent !== 100) {
                add("status", input.status);
            }
            if (input.progressPercent !== undefined && input.progressPercent !== 100
                && !("status" in input && input.status === "completed")) {
                add("progress_percent", input.progressPercent);
            }
            if ("dueAt" in input && input.dueAt !== undefined) add("due_at", input.dueAt);
            if (input.employeeNotes !== undefined) add("employee_notes", input.employeeNotes);
            if ("managerNotes" in input && input.managerNotes !== undefined) {
                add("manager_notes", input.managerNotes);
            }
            if (("status" in input && input.status === "completed")
                || input.progressPercent === 100) {
                add("status", "completed"); add("progress_percent", 100);
                add("completed_at", new Date());
            }
            const result = await client.query(
                `UPDATE development_actions SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await refreshPlan(client, planId);
            await addAuditLog(client, companyId, actor, "development.action.updated",
                "development_action", actionId, { planId, changedFields: Object.keys(input) });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async refresh(planId: string): Promise<void> {
        const client = await database.connect();
        try { await refreshPlan(client, planId); } finally { client.release(); }
    }

    async getDashboardMetrics(context: AuthenticationContext): Promise<DevelopmentDashboardMetrics> {
        const admin = context.roles.includes("administrator");
        const result = await database.query<{
            published_career_tracks: number; active_plans: number;
            overdue_plans: number; my_pending_actions: number;
        }>(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM career_tracks
                 WHERE company_id = $1 AND deleted_at IS NULL AND status = 'published'
                   AND ($2::BOOLEAN OR department_id IS NULL OR department_id = $3))
                    AS published_career_tracks,
                COUNT(*) FILTER (WHERE development_plans.status IN ('active', 'overdue')
                    AND ($2::BOOLEAN OR employee.department_id = $3))::INTEGER AS active_plans,
                COUNT(*) FILTER (WHERE development_plans.status = 'overdue'
                    AND ($2::BOOLEAN OR employee.department_id = $3))::INTEGER AS overdue_plans,
                (SELECT COUNT(*)::INTEGER FROM development_actions
                 WHERE development_actions.company_id = $1
                   AND development_actions.responsible_employee_id = $4
                   AND development_actions.status NOT IN ('completed', 'cancelled'))
                    AS my_pending_actions
             FROM development_plans
             INNER JOIN employees AS employee ON employee.id = development_plans.employee_id
             WHERE development_plans.company_id = $1 AND development_plans.deleted_at IS NULL`,
            [context.companyId, admin, context.departmentId, context.employeeId],
        );
        const row = result.rows[0];
        return { publishedCareerTracks: row?.published_career_tracks ?? 0,
            activePlans: row?.active_plans ?? 0, overduePlans: row?.overdue_plans ?? 0,
            myPendingActions: row?.my_pending_actions ?? 0 };
    }
}

export const developmentPlansRepository = new DevelopmentPlansRepository();


