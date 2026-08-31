import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    CreateEvaluationCycleInput,
    EvaluationCycleListQuery,
    UpdateEvaluationCycleInput,
} from "../schemas/evaluations.schemas.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface EvaluationCompetency {
    id: string;
    name: string;
    description: string;
    category: "behavioral" | "technical" | "leadership" | "cultural";
    weight: number;
    position: number;
}

export interface EvaluationCycle {
    id: string;
    companyId: string;
    departmentId: string | null;
    departmentName: string | null;
    code: string;
    name: string;
    description: string;
    status: "draft" | "scheduled" | "active" | "completed" | "cancelled";
    startsOn: string;
    selfReviewDeadline: string;
    managerReviewDeadline: string;
    feedbackDeadline: string;
    selfWeight: number;
    managerWeight: number;
    assignmentCount: number;
    completedAssignmentCount: number;
    competencies: EvaluationCompetency[];
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
}

interface CycleRow {
    id: string;
    company_id: string;
    department_id: string | null;
    department_name: string | null;
    code: string;
    name: string;
    description: string;
    status: EvaluationCycle["status"];
    starts_on: string;
    self_review_deadline: string;
    manager_review_deadline: string;
    feedback_deadline: string;
    self_weight: string;
    manager_weight: string;
    assignment_count: number;
    completed_assignment_count: number;
    created_at: Date;
    updated_at: Date;
    completed_at: Date | null;
    total?: number;
}

interface CompetencyRow {
    id: string;
    name: string;
    description: string;
    category: EvaluationCompetency["category"];
    weight: string;
    position: number;
}

const cycleColumns = `
    evaluation_cycles.id, evaluation_cycles.company_id,
    evaluation_cycles.department_id, departments.name AS department_name,
    evaluation_cycles.code, evaluation_cycles.name, evaluation_cycles.description,
    evaluation_cycles.status, evaluation_cycles.starts_on,
    evaluation_cycles.self_review_deadline, evaluation_cycles.manager_review_deadline,
    evaluation_cycles.feedback_deadline, evaluation_cycles.self_weight,
    evaluation_cycles.manager_weight, evaluation_cycles.created_at,
    evaluation_cycles.updated_at, evaluation_cycles.completed_at,
    (SELECT COUNT(*)::INTEGER FROM evaluation_assignments
     WHERE evaluation_assignments.cycle_id = evaluation_cycles.id
       AND evaluation_assignments.deleted_at IS NULL) AS assignment_count,
    (SELECT COUNT(*)::INTEGER FROM evaluation_assignments
     WHERE evaluation_assignments.cycle_id = evaluation_cycles.id
       AND evaluation_assignments.deleted_at IS NULL
       AND evaluation_assignments.status = 'completed') AS completed_assignment_count
`;

const mapCycle = (row: CycleRow, competencies: EvaluationCompetency[] = []): EvaluationCycle => ({
    id: row.id, companyId: row.company_id, departmentId: row.department_id,
    departmentName: row.department_name, code: row.code, name: row.name,
    description: row.description, status: row.status, startsOn: row.starts_on,
    selfReviewDeadline: row.self_review_deadline,
    managerReviewDeadline: row.manager_review_deadline,
    feedbackDeadline: row.feedback_deadline, selfWeight: Number(row.self_weight),
    managerWeight: Number(row.manager_weight), assignmentCount: row.assignment_count,
    completedAssignmentCount: row.completed_assignment_count, competencies,
    createdAt: row.created_at, updatedAt: row.updated_at, completedAt: row.completed_at,
});

const addAuditLog = async (
    client: PoolClient, companyId: string, actor: AuditActor, event: string,
    cycleId: string, changedFields?: string[],
): Promise<void> => {
    await client.query(
        `INSERT INTO audit_logs (
            company_id, actor_user_id, event, entity_type, entity_id, request_id, context
         ) VALUES ($1, $2, $3, 'evaluation_cycle', $4, $5, $6::JSONB)`,
        [companyId, actor.userId, event, cycleId, actor.requestId ?? null,
            JSON.stringify(changedFields ? { changedFields } : {})],
    );
};

const insertCompetencies = async (
    client: PoolClient, cycleId: string,
    competencies: CreateEvaluationCycleInput["competencies"],
): Promise<void> => {
    for (const [index, competency] of competencies.entries()) {
        await client.query(
            `INSERT INTO evaluation_competencies (
                cycle_id, name, description, category, weight, position
             ) VALUES ($1, $2, $3, $4, $5, $6)`,
            [cycleId, competency.name, competency.description, competency.category,
                competency.weight, index + 1],
        );
    }
};

export class EvaluationCyclesRepository {
    async list(
        companyId: string, scopeDepartmentId: string | undefined,
        query: EvaluationCycleListQuery,
    ): Promise<PaginatedResult<EvaluationCycle>> {
        const result = await database.query<CycleRow>(
            `SELECT ${cycleColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM evaluation_cycles
             LEFT JOIN departments ON departments.id = evaluation_cycles.department_id
             WHERE evaluation_cycles.company_id = $1
               AND evaluation_cycles.deleted_at IS NULL
               AND ($2::UUID IS NULL OR evaluation_cycles.department_id IS NULL
                    OR evaluation_cycles.department_id = $2)
               AND ($3::TEXT IS NULL OR evaluation_cycles.code ILIKE '%' || $3 || '%'
                    OR evaluation_cycles.name ILIKE '%' || $3 || '%')
               AND ($4::UUID IS NULL OR evaluation_cycles.department_id = $4)
               AND ($5::TEXT IS NULL OR evaluation_cycles.status::TEXT = $5)
             ORDER BY evaluation_cycles.starts_on DESC, evaluation_cycles.name
             LIMIT $6 OFFSET $7`,
            [companyId, scopeDepartmentId ?? null, query.search ?? null,
                query.departmentId ?? null, query.status ?? null, query.pageSize,
                (query.page - 1) * query.pageSize],
        );
        return { items: result.rows.map((row) => mapCycle(row)),
            total: result.rows[0]?.total ?? 0 };
    }

    async findById(
        companyId: string, cycleId: string, scopeDepartmentId?: string,
    ): Promise<EvaluationCycle | null> {
        const result = await database.query<CycleRow>(
            `SELECT ${cycleColumns}
             FROM evaluation_cycles
             LEFT JOIN departments ON departments.id = evaluation_cycles.department_id
             WHERE evaluation_cycles.company_id = $1 AND evaluation_cycles.id = $2
               AND evaluation_cycles.deleted_at IS NULL
               AND ($3::UUID IS NULL OR evaluation_cycles.department_id IS NULL
                    OR evaluation_cycles.department_id = $3)`,
            [companyId, cycleId, scopeDepartmentId ?? null],
        );
        const row = result.rows[0];
        if (!row) return null;
        const competencies = await database.query<CompetencyRow>(
            `SELECT id, name, description, category, weight, position
             FROM evaluation_competencies WHERE cycle_id = $1 ORDER BY position`,
            [cycleId],
        );
        return mapCycle(row, competencies.rows.map((item) => ({
            id: item.id, name: item.name, description: item.description,
            category: item.category, weight: Number(item.weight), position: item.position,
        })));
    }

    async create(
        companyId: string, departmentId: string | null,
        input: CreateEvaluationCycleInput, actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO evaluation_cycles (
                    company_id, department_id, code, name, description, status,
                    starts_on, self_review_deadline, manager_review_deadline,
                    feedback_deadline, self_weight, manager_weight, created_by, updated_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
                 RETURNING id`,
                [companyId, departmentId, input.code, input.name, input.description,
                    input.status, input.startsOn, input.selfReviewDeadline,
                    input.managerReviewDeadline, input.feedbackDeadline,
                    input.selfWeight, input.managerWeight, actor.userId],
            );
            const id = result.rows[0]?.id;
            if (!id) throw new Error("Falha ao criar ciclo de avaliação.");
            await insertCompetencies(client, id, input.competencies);
            await addAuditLog(client, companyId, actor, "evaluation.cycle.created", id);
            await client.query("COMMIT");
            return id;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async update(
        companyId: string, cycleId: string, input: UpdateEvaluationCycleInput,
        departmentId: string | null | undefined, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, cycleId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if (departmentId !== undefined) add("department_id", departmentId);
            if (input.code !== undefined) add("code", input.code);
            if (input.name !== undefined) add("name", input.name);
            if (input.description !== undefined) add("description", input.description);
            if (input.status !== undefined) {
                add("status", input.status);
                if (input.status === "completed") add("completed_at", new Date());
            }
            if (input.startsOn !== undefined) add("starts_on", input.startsOn);
            if (input.selfReviewDeadline !== undefined) {
                add("self_review_deadline", input.selfReviewDeadline);
            }
            if (input.managerReviewDeadline !== undefined) {
                add("manager_review_deadline", input.managerReviewDeadline);
            }
            if (input.feedbackDeadline !== undefined) add("feedback_deadline", input.feedbackDeadline);
            if (input.selfWeight !== undefined) add("self_weight", input.selfWeight);
            if (input.managerWeight !== undefined) add("manager_weight", input.managerWeight);
            add("updated_by", actor.userId);
            const result = await client.query(
                `UPDATE evaluation_cycles SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            if (input.competencies) {
                await client.query("DELETE FROM evaluation_competencies WHERE cycle_id = $1", [cycleId]);
                await insertCompetencies(client, cycleId, input.competencies);
            }
            await addAuditLog(client, companyId, actor, "evaluation.cycle.updated",
                cycleId, Object.keys(input));
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async archive(
        companyId: string, cycleId: string, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `UPDATE evaluation_cycles
                 SET status = 'cancelled', deleted_at = NOW(), updated_by = $3
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
                [companyId, cycleId, actor.userId],
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await addAuditLog(client, companyId, actor, "evaluation.cycle.archived", cycleId);
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }
}

export const evaluationCyclesRepository = new EvaluationCyclesRepository();
