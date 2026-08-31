import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type { AuthenticationContext } from "./auth.repository.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    JourneyAssignmentListQuery,
    MyJourneyListQuery,
    UpdateJourneyAssignmentInput,
    UpdateJourneyTaskInput,
} from "../schemas/journeys.schemas.js";

export interface JourneyEmployee {
    id: string;
    companyId: string;
    departmentId: string;
    fullName: string;
    email: string;
    status: "active" | "on_leave" | "inactive";
}

export interface JourneyAssignment {
    id: string;
    companyId: string;
    templateId: string;
    templateCode: string;
    templateName: string;
    kind: "onboarding" | "offboarding" | "development" | "custom";
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    departmentId: string;
    departmentName: string;
    ownerEmployeeId: string;
    ownerName: string;
    status: "planned" | "in_progress" | "completed" | "overdue" | "cancelled";
    startsOn: string;
    targetEndOn: string;
    progressPercent: number;
    notes: string | null;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    cancelledAt: Date | null;
}

export interface JourneyTask {
    id: string;
    assignmentId: string;
    templateTaskId: string;
    stageId: string;
    stageName: string;
    stagePosition: number;
    title: string;
    description: string | null;
    taskType: "manual" | "training" | "meeting" | "document";
    responsible: "collaborator" | "owner";
    required: boolean;
    position: number;
    status: "pending" | "in_progress" | "completed" | "skipped" | "blocked";
    dueAt: Date;
    isOverdue: boolean;
    responsibleEmployeeId: string;
    responsibleEmployeeName: string;
    trainingId: string | null;
    trainingTitle: string | null;
    trainingEnrollmentId: string | null;
    calendarEventId: string | null;
    resourceUrl: string | null;
    evidenceUrl: string | null;
    notes: string | null;
    startedAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface JourneyAssignmentDetail extends JourneyAssignment {
    stages: Array<{
        id: string;
        name: string;
        position: number;
        tasks: JourneyTask[];
    }>;
}

export interface JourneyDashboardMetrics {
    activeJourneys: number;
    overdueJourneys: number;
    myActiveJourneys: number;
    myPendingTasks: number;
}

interface AssignmentRow {
    id: string;
    company_id: string;
    template_id: string;
    template_code: string;
    template_name: string;
    kind: JourneyAssignment["kind"];
    employee_id: string;
    employee_name: string;
    employee_email: string;
    department_id: string;
    department_name: string;
    owner_employee_id: string;
    owner_name: string;
    status: JourneyAssignment["status"];
    starts_on: string;
    target_end_on: string;
    progress_percent: string;
    notes: string | null;
    total_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    created_at: Date;
    updated_at: Date;
    completed_at: Date | null;
    cancelled_at: Date | null;
    total?: number;
}

interface TaskRow {
    id: string;
    assignment_id: string;
    template_task_id: string;
    stage_id: string;
    stage_name: string;
    stage_position: number;
    title: string;
    description: string | null;
    task_type: JourneyTask["taskType"];
    responsible: JourneyTask["responsible"];
    required: boolean;
    position: number;
    status: JourneyTask["status"];
    due_at: Date;
    is_overdue: boolean;
    responsible_employee_id: string;
    responsible_employee_name: string;
    training_id: string | null;
    training_title: string | null;
    training_enrollment_id: string | null;
    calendar_event_id: string | null;
    resource_url: string | null;
    evidence_url: string | null;
    notes: string | null;
    started_at: Date | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
}

interface TemplateTaskSourceRow {
    id: string;
    title: string;
    description: string | null;
    task_type: JourneyTask["taskType"];
    responsible: JourneyTask["responsible"];
    due_after_days: number;
    training_id: string | null;
    meeting_time: string | null;
    meeting_duration_minutes: number | null;
}

const assignmentColumns = `
    journey_assignments.id, journey_assignments.company_id,
    journey_assignments.template_id, journey_templates.code AS template_code,
    journey_templates.name AS template_name, journey_templates.kind,
    journey_assignments.employee_id, employees.full_name AS employee_name,
    employees.email AS employee_email, employees.department_id,
    departments.name AS department_name,
    journey_assignments.owner_employee_id, owner.full_name AS owner_name,
    journey_assignments.status, journey_assignments.starts_on,
    journey_assignments.target_end_on, journey_assignments.progress_percent,
    journey_assignments.notes, journey_assignments.created_at,
    journey_assignments.updated_at, journey_assignments.completed_at,
    journey_assignments.cancelled_at,
    (SELECT COUNT(*)::INTEGER FROM journey_tasks
     WHERE journey_tasks.assignment_id = journey_assignments.id) AS total_tasks,
    (SELECT COUNT(*)::INTEGER FROM journey_tasks
     WHERE journey_tasks.assignment_id = journey_assignments.id
       AND journey_tasks.status IN ('completed', 'skipped')) AS completed_tasks,
    (SELECT COUNT(*)::INTEGER FROM journey_tasks
     WHERE journey_tasks.assignment_id = journey_assignments.id
       AND journey_tasks.status NOT IN ('completed', 'skipped')
       AND journey_tasks.due_at < NOW()) AS overdue_tasks
`;

const assignmentJoins = `
    INNER JOIN journey_templates ON journey_templates.id = journey_assignments.template_id
    INNER JOIN employees ON employees.id = journey_assignments.employee_id
    INNER JOIN departments ON departments.id = employees.department_id
    INNER JOIN employees AS owner ON owner.id = journey_assignments.owner_employee_id
`;

const taskColumns = `
    journey_tasks.id, journey_tasks.assignment_id, journey_tasks.template_task_id,
    journey_template_stages.id AS stage_id, journey_template_stages.name AS stage_name,
    journey_template_stages.position AS stage_position,
    journey_template_tasks.title, journey_template_tasks.description,
    journey_template_tasks.task_type, journey_template_tasks.responsible,
    journey_template_tasks.required, journey_template_tasks.position,
    journey_tasks.status, journey_tasks.due_at,
    (journey_tasks.status NOT IN ('completed', 'skipped') AND journey_tasks.due_at < NOW())
        AS is_overdue,
    journey_tasks.responsible_employee_id,
    responsible_employee.full_name AS responsible_employee_name,
    journey_template_tasks.training_id, trainings.title AS training_title,
    journey_tasks.training_enrollment_id, journey_tasks.calendar_event_id,
    journey_template_tasks.resource_url, journey_tasks.evidence_url,
    journey_tasks.notes, journey_tasks.started_at, journey_tasks.completed_at,
    journey_tasks.created_at, journey_tasks.updated_at
`;

const mapAssignment = (row: AssignmentRow): JourneyAssignment => ({
    id: row.id, companyId: row.company_id, templateId: row.template_id,
    templateCode: row.template_code, templateName: row.template_name, kind: row.kind,
    employeeId: row.employee_id, employeeName: row.employee_name,
    employeeEmail: row.employee_email, departmentId: row.department_id,
    departmentName: row.department_name, ownerEmployeeId: row.owner_employee_id,
    ownerName: row.owner_name, status: row.status, startsOn: row.starts_on,
    targetEndOn: row.target_end_on, progressPercent: Number(row.progress_percent),
    notes: row.notes, totalTasks: row.total_tasks, completedTasks: row.completed_tasks,
    overdueTasks: row.overdue_tasks, createdAt: row.created_at, updatedAt: row.updated_at,
    completedAt: row.completed_at, cancelledAt: row.cancelled_at,
});

const mapTask = (row: TaskRow): JourneyTask => ({
    id: row.id, assignmentId: row.assignment_id, templateTaskId: row.template_task_id,
    stageId: row.stage_id, stageName: row.stage_name, stagePosition: row.stage_position,
    title: row.title, description: row.description, taskType: row.task_type,
    responsible: row.responsible, required: row.required, position: row.position,
    status: row.status, dueAt: row.due_at, isOverdue: row.is_overdue,
    responsibleEmployeeId: row.responsible_employee_id,
    responsibleEmployeeName: row.responsible_employee_name,
    trainingId: row.training_id, trainingTitle: row.training_title,
    trainingEnrollmentId: row.training_enrollment_id, calendarEventId: row.calendar_event_id,
    resourceUrl: row.resource_url, evidenceUrl: row.evidence_url, notes: row.notes,
    startedAt: row.started_at, completedAt: row.completed_at,
    createdAt: row.created_at, updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient, companyId: string, actor: AuditActor, event: string,
    entityType: "journey_assignment" | "journey_task", entityId: string,
    context: Record<string, unknown> = {},
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)`,
        [companyId, actor.userId, event, entityType, entityId, actor.requestId ?? null,
            JSON.stringify(context)],
    );
};

const refreshAssignment = async (client: PoolClient, assignmentId: string): Promise<void> => {
    await client.query(
        `UPDATE journey_tasks
         SET status = 'completed', completed_at = COALESCE(journey_tasks.completed_at, training_enrollments.completed_at),
             updated_at = NOW()
         FROM training_enrollments
         WHERE journey_tasks.assignment_id = $1
           AND journey_tasks.training_enrollment_id = training_enrollments.id
           AND training_enrollments.status = 'completed'
           AND journey_tasks.status <> 'completed'`,
        [assignmentId],
    );
    await client.query(
        `WITH progress AS (
            SELECT COUNT(*)::INTEGER AS total,
                   COUNT(*) FILTER (WHERE status IN ('completed', 'skipped'))::INTEGER AS done
            FROM journey_tasks WHERE assignment_id = $1
         )
         UPDATE journey_assignments
         SET progress_percent = CASE WHEN progress.total = 0 THEN 0
                 ELSE ROUND(progress.done * 100.0 / progress.total, 2) END,
             status = CASE
                 WHEN journey_assignments.status = 'cancelled' THEN 'cancelled'::journey_assignment_status
                 WHEN progress.total > 0 AND progress.done = progress.total
                    THEN 'completed'::journey_assignment_status
                 WHEN journey_assignments.target_end_on < CURRENT_DATE
                    THEN 'overdue'::journey_assignment_status
                 WHEN journey_assignments.starts_on <= CURRENT_DATE
                    THEN 'in_progress'::journey_assignment_status
                 ELSE 'planned'::journey_assignment_status END,
             completed_at = CASE WHEN progress.total > 0 AND progress.done = progress.total
                 THEN COALESCE(journey_assignments.completed_at, NOW()) ELSE NULL END
         FROM progress WHERE journey_assignments.id = $1`,
        [assignmentId],
    );
};

export class JourneyAssignmentsRepository {
    async findEmployee(companyId: string, employeeId: string): Promise<JourneyEmployee | null> {
        const result = await database.query<{
            id: string; company_id: string; department_id: string; full_name: string;
            email: string; status: JourneyEmployee["status"];
        }>(
            `SELECT id, company_id, department_id, full_name, email, status
             FROM employees WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
            [companyId, employeeId],
        );
        const row = result.rows[0];
        return row ? { id: row.id, companyId: row.company_id, departmentId: row.department_id,
            fullName: row.full_name, email: row.email, status: row.status } : null;
    }

    async countByTemplate(companyId: string, templateId: string): Promise<number> {
        const result = await database.query<{ total: number }>(
            `SELECT COUNT(*)::INTEGER AS total FROM journey_assignments
             WHERE company_id = $1 AND template_id = $2 AND deleted_at IS NULL`,
            [companyId, templateId],
        );
        return result.rows[0]?.total ?? 0;
    }

    async list(
        companyId: string, scopeDepartmentId: string | undefined,
        query: JourneyAssignmentListQuery,
    ): Promise<PaginatedResult<JourneyAssignment>> {
        const offset = (query.page - 1) * query.pageSize;
        const result = await database.query<AssignmentRow>(
            `SELECT ${assignmentColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM journey_assignments ${assignmentJoins}
             WHERE journey_assignments.company_id = $1
               AND journey_assignments.deleted_at IS NULL
               AND ($2::UUID IS NULL OR employees.department_id = $2)
               AND ($3::TEXT IS NULL OR employees.full_name ILIKE '%' || $3 || '%'
                    OR employees.email ILIKE '%' || $3 || '%'
                    OR journey_templates.name ILIKE '%' || $3 || '%')
               AND ($4::UUID IS NULL OR journey_assignments.template_id = $4)
               AND ($5::UUID IS NULL OR journey_assignments.employee_id = $5)
               AND ($6::UUID IS NULL OR employees.department_id = $6)
               AND ($7::TEXT IS NULL OR journey_assignments.status::TEXT = $7)
             ORDER BY journey_assignments.updated_at DESC
             LIMIT $8 OFFSET $9`,
            [companyId, scopeDepartmentId ?? null, query.search ?? null,
                query.templateId ?? null, query.employeeId ?? null,
                query.departmentId ?? null, query.status ?? null, query.pageSize, offset],
        );
        return { items: result.rows.map(mapAssignment), total: result.rows[0]?.total ?? 0 };
    }

    async listMine(
        companyId: string, employeeId: string, query: MyJourneyListQuery,
    ): Promise<PaginatedResult<JourneyAssignment>> {
        const offset = (query.page - 1) * query.pageSize;
        const ids = await database.query<{ id: string }>(
            `SELECT id FROM journey_assignments
             WHERE company_id = $1 AND employee_id = $2 AND deleted_at IS NULL`,
            [companyId, employeeId],
        );
        await Promise.all(ids.rows.map(({ id }) => this.refresh(id)));
        const result = await database.query<AssignmentRow>(
            `SELECT ${assignmentColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM journey_assignments ${assignmentJoins}
             WHERE journey_assignments.company_id = $1
               AND journey_assignments.employee_id = $2
               AND journey_assignments.deleted_at IS NULL
               AND ($3::TEXT IS NULL OR journey_assignments.status::TEXT = $3)
             ORDER BY journey_assignments.created_at DESC
             LIMIT $4 OFFSET $5`,
            [companyId, employeeId, query.status ?? null, query.pageSize, offset],
        );
        return { items: result.rows.map(mapAssignment), total: result.rows[0]?.total ?? 0 };
    }

    async findById(
        companyId: string, assignmentId: string, scopeDepartmentId?: string,
    ): Promise<JourneyAssignmentDetail | null> {
        await this.refresh(assignmentId);
        const result = await database.query<AssignmentRow>(
            `SELECT ${assignmentColumns}
             FROM journey_assignments ${assignmentJoins}
             WHERE journey_assignments.company_id = $1 AND journey_assignments.id = $2
               AND journey_assignments.deleted_at IS NULL
               AND ($3::UUID IS NULL OR employees.department_id = $3)`,
            [companyId, assignmentId, scopeDepartmentId ?? null],
        );
        const row = result.rows[0];
        if (!row) return null;
        return this.attachTasks(mapAssignment(row));
    }

    async findMine(
        companyId: string, employeeId: string, assignmentId: string,
    ): Promise<JourneyAssignmentDetail | null> {
        const detail = await this.findById(companyId, assignmentId);
        return detail?.employeeId === employeeId ? detail : null;
    }

    private async attachTasks(assignment: JourneyAssignment): Promise<JourneyAssignmentDetail> {
        const result = await database.query<TaskRow>(
            `SELECT ${taskColumns}
             FROM journey_tasks
             INNER JOIN journey_template_tasks
                ON journey_template_tasks.id = journey_tasks.template_task_id
             INNER JOIN journey_template_stages
                ON journey_template_stages.id = journey_template_tasks.stage_id
             INNER JOIN employees AS responsible_employee
                ON responsible_employee.id = journey_tasks.responsible_employee_id
             LEFT JOIN trainings ON trainings.id = journey_template_tasks.training_id
             WHERE journey_tasks.assignment_id = $1
             ORDER BY journey_template_stages.position, journey_template_tasks.position`,
            [assignment.id],
        );
        const tasks = result.rows.map(mapTask);
        const stages = [...new Map(tasks.map((task) => [task.stageId, {
            id: task.stageId, name: task.stageName, position: task.stagePosition, tasks: [] as JourneyTask[],
        }])).values()];
        for (const task of tasks) stages.find((stage) => stage.id === task.stageId)?.tasks.push(task);
        return { ...assignment, stages };
    }

    async create(
        context: AuthenticationContext,
        input: { templateId: string; employeeId: string; ownerEmployeeId: string;
            startsOn: string; targetEndOn: string; notes: string | null },
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const assignmentResult = await client.query<{ id: string }>(
                `INSERT INTO journey_assignments (
                    company_id, template_id, employee_id, owner_employee_id,
                    starts_on, target_end_on, notes, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
                [context.companyId, input.templateId, input.employeeId, input.ownerEmployeeId,
                    input.startsOn, input.targetEndOn, input.notes, actor.userId],
            );
            const assignmentId = assignmentResult.rows[0]?.id;
            if (!assignmentId) throw new Error("Falha ao atribuir jornada.");
            const sourceResult = await client.query<TemplateTaskSourceRow>(
                `SELECT journey_template_tasks.id, journey_template_tasks.title,
                        journey_template_tasks.description, journey_template_tasks.task_type,
                        journey_template_tasks.responsible, journey_template_tasks.due_after_days,
                        journey_template_tasks.training_id,
                        journey_template_tasks.meeting_time,
                        journey_template_tasks.meeting_duration_minutes
                 FROM journey_template_tasks
                 INNER JOIN journey_template_stages
                    ON journey_template_stages.id = journey_template_tasks.stage_id
                 WHERE journey_template_stages.template_id = $1
                 ORDER BY journey_template_stages.position, journey_template_tasks.position`,
                [input.templateId],
            );
            for (const task of sourceResult.rows) {
                const responsibleId = task.responsible === "owner"
                    ? input.ownerEmployeeId : input.employeeId;
                const dueResult = await client.query<{ due_at: Date }>(
                    `SELECT (($1::DATE + MAKE_INTERVAL(days => $2)
                        + COALESCE($3::TIME, TIME '12:00')) AT TIME ZONE 'America/Cuiaba') AS due_at`,
                    [input.startsOn, task.due_after_days, task.meeting_time],
                );
                const dueAt = dueResult.rows[0]?.due_at;
                if (!dueAt) throw new Error("Falha ao calcular prazo da tarefa.");
                const taskResult = await client.query<{ id: string }>(
                    `INSERT INTO journey_tasks (
                        company_id, assignment_id, template_task_id,
                        responsible_employee_id, due_at
                     ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [context.companyId, assignmentId, task.id, responsibleId, dueAt],
                );
                const journeyTaskId = taskResult.rows[0]?.id;
                if (!journeyTaskId) throw new Error("Falha ao criar tarefa da jornada.");
                if (task.task_type === "meeting" && task.meeting_duration_minutes) {
                    const eventResult = await client.query<{ id: string }>(
                        `INSERT INTO calendar_events (
                            company_id, title, description, event_type, visibility, status,
                            starts_at, ends_at, all_day, timezone, created_by, updated_by
                         ) VALUES ($1, $2, $3, 'onboarding', 'participants', 'scheduled',
                            $4, $4::TIMESTAMPTZ + MAKE_INTERVAL(mins => $5), FALSE,
                            'America/Cuiaba', $6, $6) RETURNING id`,
                        [context.companyId, task.title, task.description, dueAt,
                            task.meeting_duration_minutes, actor.userId],
                    );
                    const eventId = eventResult.rows[0]?.id;
                    if (eventId) {
                        await client.query(
                            `INSERT INTO calendar_event_attendees (event_id, employee_id)
                             SELECT $1, employee_id FROM UNNEST($2::UUID[]) employee_id
                             ON CONFLICT DO NOTHING`,
                            [eventId, [...new Set([input.employeeId, input.ownerEmployeeId])]],
                        );
                        await client.query("UPDATE journey_tasks SET calendar_event_id = $1 WHERE id = $2",
                            [eventId, journeyTaskId]);
                    }
                }
                if (task.task_type === "training" && task.training_id) {
                    await this.linkTraining(client, context.companyId, input.employeeId,
                        task.training_id, input.startsOn, journeyTaskId, actor.userId);
                }
            }
            await refreshAssignment(client, assignmentId);
            await addAuditLog(client, context.companyId, actor, "journey.assignment.created",
                "journey_assignment", assignmentId, { templateId: input.templateId,
                    employeeId: input.employeeId, ownerEmployeeId: input.ownerEmployeeId });
            await client.query("COMMIT");
            return assignmentId;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    private async linkTraining(
        client: PoolClient, companyId: string, employeeId: string, trainingId: string,
        startsOn: string, journeyTaskId: string, userId: string,
    ): Promise<void> {
        const classResult = await client.query<{ id: string; calendar_event_id: string | null }>(
            `SELECT training_classes.id, training_classes.calendar_event_id
             FROM training_classes
             INNER JOIN employees ON employees.id = $2
             WHERE training_classes.company_id = $1
               AND training_classes.training_id = $3
               AND training_classes.status = 'open'
               AND training_classes.deleted_at IS NULL
               AND training_classes.starts_at >= $4::DATE
               AND (training_classes.enrollment_deadline IS NULL
                    OR training_classes.enrollment_deadline >= NOW())
               AND (training_classes.department_id IS NULL
                    OR training_classes.department_id = employees.department_id)
               AND (training_classes.capacity IS NULL OR training_classes.capacity > (
                    SELECT COUNT(*) FROM training_enrollments
                    WHERE training_enrollments.class_id = training_classes.id
                      AND training_enrollments.deleted_at IS NULL
                      AND training_enrollments.status <> 'cancelled'))
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
                "UPDATE journey_tasks SET training_enrollment_id = $1 WHERE id = $2",
                [enrollment.rows[0].id, journeyTaskId],
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

    async update(
        companyId: string, assignmentId: string, input: UpdateJourneyAssignmentInput,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, assignmentId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if (input.ownerEmployeeId !== undefined) add("owner_employee_id", input.ownerEmployeeId);
            if (input.status !== undefined) add("status", input.status);
            if (input.targetEndOn !== undefined) add("target_end_on", input.targetEndOn);
            if (input.notes !== undefined) add("notes", input.notes);
            if (input.status === "cancelled") add("cancelled_at", new Date());
            const result = await client.query(
                `UPDATE journey_assignments SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            if (input.ownerEmployeeId) {
                await client.query(
                    `UPDATE journey_tasks SET responsible_employee_id = $1
                     FROM journey_template_tasks
                     WHERE journey_tasks.assignment_id = $2
                       AND journey_tasks.template_task_id = journey_template_tasks.id
                       AND journey_template_tasks.responsible = 'owner'
                       AND journey_tasks.status NOT IN ('completed', 'skipped')`,
                    [input.ownerEmployeeId, assignmentId],
                );
                await client.query(
                    `INSERT INTO calendar_event_attendees (event_id, employee_id)
                     SELECT calendar_event_id, $1 FROM journey_tasks
                     WHERE assignment_id = $2 AND calendar_event_id IS NOT NULL
                     ON CONFLICT DO NOTHING`,
                    [input.ownerEmployeeId, assignmentId],
                );
            }
            if (input.status === "cancelled") {
                await client.query(
                    `UPDATE calendar_events SET status = 'cancelled'
                     WHERE id IN (SELECT calendar_event_id FROM journey_tasks
                         WHERE assignment_id = $1 AND calendar_event_id IS NOT NULL)`,
                    [assignmentId],
                );
            }
            await refreshAssignment(client, assignmentId);
            await addAuditLog(client, companyId, actor, "journey.assignment.updated",
                "journey_assignment", assignmentId, { changedFields: Object.keys(input) });
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async updateTask(
        companyId: string, assignmentId: string, taskId: string,
        input: UpdateJourneyTaskInput, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, assignmentId, taskId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if (input.status !== undefined) {
                add("status", input.status);
                if (input.status === "in_progress") add("started_at", new Date());
                if (input.status === "completed" || input.status === "skipped") {
                    add("completed_at", new Date()); add("completed_by", actor.userId);
                }
            }
            if (input.responsibleEmployeeId !== undefined) {
                add("responsible_employee_id", input.responsibleEmployeeId);
            }
            if (input.evidenceUrl !== undefined) add("evidence_url", input.evidenceUrl);
            if (input.notes !== undefined) add("notes", input.notes);
            const result = await client.query(
                `UPDATE journey_tasks SET ${fields.join(", ")}
                 WHERE company_id = $1 AND assignment_id = $2 AND id = $3`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await refreshAssignment(client, assignmentId);
            await addAuditLog(client, companyId, actor, "journey.task.updated", "journey_task",
                taskId, { assignmentId, changedFields: Object.keys(input) });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async cancel(companyId: string, assignmentId: string, actor: AuditActor): Promise<boolean> {
        return this.update(companyId, assignmentId, { status: "cancelled" }, actor);
    }

    async refresh(assignmentId: string): Promise<void> {
        const client = await database.connect();
        try { await refreshAssignment(client, assignmentId); } finally { client.release(); }
    }

    async getDashboardMetrics(context: AuthenticationContext): Promise<JourneyDashboardMetrics> {
        const isAdmin = context.roles.includes("administrator");
        const result = await database.query<{
            active_journeys: number; overdue_journeys: number;
            my_active_journeys: number; my_pending_tasks: number;
        }>(
            `SELECT
                COUNT(*) FILTER (WHERE journey_assignments.status IN ('planned', 'in_progress', 'overdue')
                    AND ($2::BOOLEAN OR employees.department_id = $3))::INTEGER AS active_journeys,
                COUNT(*) FILTER (WHERE journey_assignments.status = 'overdue'
                    AND ($2::BOOLEAN OR employees.department_id = $3))::INTEGER AS overdue_journeys,
                COUNT(*) FILTER (WHERE journey_assignments.employee_id = $4
                    AND journey_assignments.status IN ('planned', 'in_progress', 'overdue'))::INTEGER
                    AS my_active_journeys,
                (SELECT COUNT(*)::INTEGER FROM journey_tasks
                 WHERE journey_tasks.company_id = $1
                   AND journey_tasks.responsible_employee_id = $4
                   AND journey_tasks.status NOT IN ('completed', 'skipped')) AS my_pending_tasks
             FROM journey_assignments
             INNER JOIN employees ON employees.id = journey_assignments.employee_id
             WHERE journey_assignments.company_id = $1 AND journey_assignments.deleted_at IS NULL`,
            [context.companyId, isAdmin, context.departmentId, context.employeeId],
        );
        const row = result.rows[0];
        return { activeJourneys: row?.active_journeys ?? 0,
            overdueJourneys: row?.overdue_journeys ?? 0,
            myActiveJourneys: row?.my_active_journeys ?? 0,
            myPendingTasks: row?.my_pending_tasks ?? 0 };
    }
}

export const journeyAssignmentsRepository = new JourneyAssignmentsRepository();
