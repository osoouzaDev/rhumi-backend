import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    CreateJourneyTemplateInput,
    JourneyTemplateListQuery,
    UpdateJourneyTemplateInput,
} from "../schemas/journeys.schemas.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface JourneyTemplateTask {
    id: string;
    title: string;
    description: string | null;
    taskType: "manual" | "training" | "meeting" | "document";
    responsible: "collaborator" | "owner";
    required: boolean;
    position: number;
    dueAfterDays: number;
    trainingId: string | null;
    trainingCode: string | null;
    trainingTitle: string | null;
    meetingTime: string | null;
    meetingDurationMinutes: number | null;
    resourceUrl: string | null;
}

export interface JourneyTemplateStage {
    id: string;
    name: string;
    description: string | null;
    position: number;
    startsAfterDays: number;
    tasks: JourneyTemplateTask[];
}

export interface JourneyTemplate {
    id: string;
    companyId: string;
    departmentId: string | null;
    departmentName: string | null;
    code: string;
    name: string;
    description: string;
    kind: "onboarding" | "offboarding" | "development" | "custom";
    durationDays: number;
    status: "draft" | "published" | "archived";
    stageCount: number;
    taskCount: number;
    activeAssignmentCount: number;
    stages: JourneyTemplateStage[];
    createdAt: Date;
    updatedAt: Date;
}

interface TemplateRow {
    id: string;
    company_id: string;
    department_id: string | null;
    department_name: string | null;
    code: string;
    name: string;
    description: string;
    kind: JourneyTemplate["kind"];
    duration_days: number;
    status: JourneyTemplate["status"];
    stage_count: number;
    task_count: number;
    active_assignment_count: number;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

interface StageRow {
    id: string;
    name: string;
    description: string | null;
    position: number;
    starts_after_days: number;
}

interface TaskRow {
    id: string;
    stage_id: string;
    title: string;
    description: string | null;
    task_type: JourneyTemplateTask["taskType"];
    responsible: JourneyTemplateTask["responsible"];
    required: boolean;
    position: number;
    due_after_days: number;
    training_id: string | null;
    training_code: string | null;
    training_title: string | null;
    meeting_time: string | null;
    meeting_duration_minutes: number | null;
    resource_url: string | null;
}

const templateColumns = `
    journey_templates.id,
    journey_templates.company_id,
    journey_templates.department_id,
    departments.name AS department_name,
    journey_templates.code,
    journey_templates.name,
    journey_templates.description,
    journey_templates.kind,
    journey_templates.duration_days,
    journey_templates.status,
    journey_templates.created_at,
    journey_templates.updated_at,
    (SELECT COUNT(*)::INTEGER FROM journey_template_stages
     WHERE journey_template_stages.template_id = journey_templates.id) AS stage_count,
    (SELECT COUNT(*)::INTEGER FROM journey_template_tasks
     INNER JOIN journey_template_stages ON journey_template_stages.id = journey_template_tasks.stage_id
     WHERE journey_template_stages.template_id = journey_templates.id) AS task_count,
    (SELECT COUNT(*)::INTEGER FROM journey_assignments
     WHERE journey_assignments.template_id = journey_templates.id
       AND journey_assignments.deleted_at IS NULL
       AND journey_assignments.status IN ('planned', 'in_progress', 'overdue'))
       AS active_assignment_count
`;

const mapTemplate = (row: TemplateRow, stages: JourneyTemplateStage[] = []): JourneyTemplate => ({
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    code: row.code,
    name: row.name,
    description: row.description,
    kind: row.kind,
    durationDays: row.duration_days,
    status: row.status,
    stageCount: row.stage_count,
    taskCount: row.task_count,
    activeAssignmentCount: row.active_assignment_count,
    stages,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    templateId: string,
    changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'journey_template', $4, $5, $6::JSONB)`,
        [companyId, actor.userId, event, templateId, actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {})],
    );
};

const insertStages = async (
    client: PoolClient,
    templateId: string,
    stages: CreateJourneyTemplateInput["stages"],
): Promise<void> => {
    for (const [stageIndex, stage] of stages.entries()) {
        const stageResult = await client.query<{ id: string }>(
            `INSERT INTO journey_template_stages (
                template_id, name, description, position, starts_after_days
             ) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [templateId, stage.name, stage.description ?? null, stageIndex + 1,
                stage.startsAfterDays],
        );
        const stageId = stageResult.rows[0]?.id;
        if (!stageId) throw new Error("Falha ao criar etapa da jornada.");

        for (const [taskIndex, task] of stage.tasks.entries()) {
            await client.query(
                `INSERT INTO journey_template_tasks (
                    stage_id, title, description, task_type, responsible, required,
                    position, due_after_days, training_id, meeting_time,
                    meeting_duration_minutes, resource_url
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                [stageId, task.title, task.description ?? null, task.taskType,
                    task.responsible, task.required, taskIndex + 1, task.dueAfterDays,
                    task.trainingId ?? null, task.meetingTime ?? null,
                    task.meetingDurationMinutes ?? null, task.resourceUrl ?? null],
            );
        }
    }
};

export class JourneyTemplatesRepository {
    async list(
        companyId: string,
        scopeDepartmentId: string | undefined,
        query: JourneyTemplateListQuery,
    ): Promise<PaginatedResult<JourneyTemplate>> {
        const offset = (query.page - 1) * query.pageSize;
        const result = await database.query<TemplateRow>(
            `SELECT ${templateColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM journey_templates
             LEFT JOIN departments ON departments.id = journey_templates.department_id
             WHERE journey_templates.company_id = $1
               AND journey_templates.deleted_at IS NULL
               AND ($2::UUID IS NULL OR journey_templates.department_id IS NULL
                    OR journey_templates.department_id = $2)
               AND ($3::TEXT IS NULL OR journey_templates.code ILIKE '%' || $3 || '%'
                    OR journey_templates.name ILIKE '%' || $3 || '%')
               AND ($4::UUID IS NULL OR journey_templates.department_id = $4)
               AND ($5::TEXT IS NULL OR journey_templates.kind::TEXT = $5)
               AND ($6::TEXT IS NULL OR journey_templates.status::TEXT = $6)
             ORDER BY journey_templates.updated_at DESC, journey_templates.name
             LIMIT $7 OFFSET $8`,
            [companyId, scopeDepartmentId ?? null, query.search ?? null,
                query.departmentId ?? null, query.kind ?? null, query.status ?? null,
                query.pageSize, offset],
        );
        return {
            items: result.rows.map((row) => mapTemplate(row)),
            total: result.rows[0]?.total ?? 0,
        };
    }

    async findById(
        companyId: string,
        templateId: string,
        scopeDepartmentId?: string,
    ): Promise<JourneyTemplate | null> {
        const templateResult = await database.query<TemplateRow>(
            `SELECT ${templateColumns}
             FROM journey_templates
             LEFT JOIN departments ON departments.id = journey_templates.department_id
             WHERE journey_templates.company_id = $1
               AND journey_templates.id = $2
               AND journey_templates.deleted_at IS NULL
               AND ($3::UUID IS NULL OR journey_templates.department_id IS NULL
                    OR journey_templates.department_id = $3)`,
            [companyId, templateId, scopeDepartmentId ?? null],
        );
        const template = templateResult.rows[0];
        if (!template) return null;

        const [stageResult, taskResult] = await Promise.all([
            database.query<StageRow>(
                `SELECT id, name, description, position, starts_after_days
                 FROM journey_template_stages WHERE template_id = $1 ORDER BY position`,
                [templateId],
            ),
            database.query<TaskRow>(
                `SELECT journey_template_tasks.id, journey_template_tasks.stage_id,
                        journey_template_tasks.title, journey_template_tasks.description,
                        journey_template_tasks.task_type, journey_template_tasks.responsible,
                        journey_template_tasks.required, journey_template_tasks.position,
                        journey_template_tasks.due_after_days,
                        journey_template_tasks.training_id, trainings.code AS training_code,
                        trainings.title AS training_title, journey_template_tasks.meeting_time,
                        journey_template_tasks.meeting_duration_minutes,
                        journey_template_tasks.resource_url
                 FROM journey_template_tasks
                 INNER JOIN journey_template_stages
                    ON journey_template_stages.id = journey_template_tasks.stage_id
                 LEFT JOIN trainings ON trainings.id = journey_template_tasks.training_id
                 WHERE journey_template_stages.template_id = $1
                 ORDER BY journey_template_stages.position, journey_template_tasks.position`,
                [templateId],
            ),
        ]);
        const stages = stageResult.rows.map<JourneyTemplateStage>((stage) => ({
            id: stage.id,
            name: stage.name,
            description: stage.description,
            position: stage.position,
            startsAfterDays: stage.starts_after_days,
            tasks: taskResult.rows.filter((task) => task.stage_id === stage.id).map((task) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                taskType: task.task_type,
                responsible: task.responsible,
                required: task.required,
                position: task.position,
                dueAfterDays: task.due_after_days,
                trainingId: task.training_id,
                trainingCode: task.training_code,
                trainingTitle: task.training_title,
                meetingTime: task.meeting_time?.slice(0, 5) ?? null,
                meetingDurationMinutes: task.meeting_duration_minutes,
                resourceUrl: task.resource_url,
            })),
        }));
        return mapTemplate(template, stages);
    }

    async create(
        companyId: string,
        departmentId: string | null,
        input: CreateJourneyTemplateInput,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO journey_templates (
                    company_id, department_id, code, name, description, kind,
                    duration_days, status, created_by, updated_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING id`,
                [companyId, departmentId, input.code, input.name, input.description,
                    input.kind, input.durationDays, input.status, actor.userId],
            );
            const templateId = result.rows[0]?.id;
            if (!templateId) throw new Error("Falha ao criar modelo de jornada.");
            await insertStages(client, templateId, input.stages);
            await addAuditLog(client, companyId, actor, "journey_template.created", templateId);
            await client.query("COMMIT");
            return templateId;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async update(
        companyId: string,
        templateId: string,
        input: UpdateJourneyTemplateInput,
        departmentId: string | null | undefined,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, templateId];
            const add = (column: string, value: unknown): void => {
                values.push(value);
                fields.push(`${column} = $${values.length}`);
            };
            if (departmentId !== undefined) add("department_id", departmentId);
            if (input.code !== undefined) add("code", input.code);
            if (input.name !== undefined) add("name", input.name);
            if (input.description !== undefined) add("description", input.description);
            if (input.kind !== undefined) add("kind", input.kind);
            if (input.durationDays !== undefined) add("duration_days", input.durationDays);
            if (input.status !== undefined) add("status", input.status);
            add("updated_by", actor.userId);

            const updateResult = await client.query(
                `UPDATE journey_templates SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
                values,
            );
            if (updateResult.rowCount === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            if (input.stages) {
                await client.query("DELETE FROM journey_template_stages WHERE template_id = $1", [templateId]);
                await insertStages(client, templateId, input.stages);
            }
            await addAuditLog(client, companyId, actor, "journey_template.updated", templateId,
                Object.keys(input));
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async archive(
        companyId: string,
        templateId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `UPDATE journey_templates
                 SET status = 'archived', deleted_at = NOW(), updated_by = $3
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
                [companyId, templateId, actor.userId],
            );
            if (result.rowCount === 0) {
                await client.query("ROLLBACK");
                return false;
            }
            await addAuditLog(client, companyId, actor, "journey_template.archived", templateId);
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}

export const journeyTemplatesRepository = new JourneyTemplatesRepository();
