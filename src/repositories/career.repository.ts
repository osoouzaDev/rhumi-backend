import type { PoolClient } from "pg";
import database from "../database/connection.js";
import type {
    CareerTrackListQuery,
    CreateCareerTrackInput,
    UpdateCareerTrackInput,
    UpsertCareerProfileInput,
} from "../schemas/development.schemas.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";

export interface CareerLevelCompetency {
    id: string;
    name: string;
    description: string;
    category: "behavioral" | "technical" | "leadership" | "cultural";
    requiredLevel: number;
    position: number;
}

export interface CareerLevelTraining {
    trainingId: string;
    trainingCode: string;
    trainingTitle: string;
    required: boolean;
}

export interface CareerLevel {
    id: string;
    positionId: string;
    positionTitle: string;
    name: string;
    description: string;
    levelNumber: number;
    minimumMonthsExperience: number;
    requirements: string | null;
    competencies: CareerLevelCompetency[];
    trainings: CareerLevelTraining[];
}

export interface CareerTrack {
    id: string;
    companyId: string;
    departmentId: string | null;
    departmentName: string | null;
    code: string;
    name: string;
    description: string;
    status: "draft" | "published" | "archived";
    levelCount: number;
    profileCount: number;
    levels: CareerLevel[];
    createdAt: Date;
    updatedAt: Date;
}

export interface CareerProfile {
    id: string;
    companyId: string;
    employeeId: string;
    employeeName: string;
    departmentId: string;
    trackId: string;
    trackCode: string;
    trackName: string;
    currentLevelId: string | null;
    currentLevelName: string | null;
    targetLevelId: string | null;
    targetLevelName: string | null;
    readinessPercent: number;
    managerNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
}

interface TrackRow {
    id: string; company_id: string; department_id: string | null;
    department_name: string | null; code: string; name: string; description: string;
    status: CareerTrack["status"]; level_count: number; profile_count: number;
    created_at: Date; updated_at: Date; total?: number;
}

interface LevelRow {
    id: string; position_id: string; position_title: string; name: string;
    description: string; level_number: number; minimum_months_experience: number;
    requirements: string | null;
}

interface CompetencyRow {
    id: string; level_id: string; name: string; description: string;
    category: CareerLevelCompetency["category"]; required_level: string; position: number;
}

interface TrainingRow {
    level_id: string; training_id: string; training_code: string;
    training_title: string; required: boolean;
}

interface ProfileRow {
    id: string; company_id: string; employee_id: string; employee_name: string;
    department_id: string; track_id: string; track_code: string; track_name: string;
    current_level_id: string | null; current_level_name: string | null;
    target_level_id: string | null; target_level_name: string | null;
    readiness_percent: string; manager_notes: string | null;
    created_at: Date; updated_at: Date;
}

const trackColumns = `
    career_tracks.id, career_tracks.company_id, career_tracks.department_id,
    departments.name AS department_name, career_tracks.code, career_tracks.name,
    career_tracks.description, career_tracks.status, career_tracks.created_at,
    career_tracks.updated_at,
    (SELECT COUNT(*)::INTEGER FROM career_levels
     WHERE career_levels.track_id = career_tracks.id) AS level_count,
    (SELECT COUNT(*)::INTEGER FROM employee_career_profiles
     WHERE employee_career_profiles.track_id = career_tracks.id) AS profile_count
`;

const mapTrack = (row: TrackRow, levels: CareerLevel[] = []): CareerTrack => ({
    id: row.id, companyId: row.company_id, departmentId: row.department_id,
    departmentName: row.department_name, code: row.code, name: row.name,
    description: row.description, status: row.status, levelCount: row.level_count,
    profileCount: row.profile_count, levels, createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapProfile = (row: ProfileRow): CareerProfile => ({
    id: row.id, companyId: row.company_id, employeeId: row.employee_id,
    employeeName: row.employee_name, departmentId: row.department_id,
    trackId: row.track_id, trackCode: row.track_code, trackName: row.track_name,
    currentLevelId: row.current_level_id, currentLevelName: row.current_level_name,
    targetLevelId: row.target_level_id, targetLevelName: row.target_level_name,
    readinessPercent: Number(row.readiness_percent), managerNotes: row.manager_notes,
    createdAt: row.created_at, updatedAt: row.updated_at,
});

const addAuditLog = async (
    client: PoolClient, companyId: string, actor: AuditActor, event: string,
    entityType: "career_track" | "career_profile", entityId: string,
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

const insertLevels = async (
    client: PoolClient, trackId: string, levels: CreateCareerTrackInput["levels"],
): Promise<void> => {
    for (const [levelIndex, level] of levels.entries()) {
        const result = await client.query<{ id: string }>(
            `INSERT INTO career_levels (
                track_id, position_id, name, description, level_number,
                minimum_months_experience, requirements
             ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [trackId, level.positionId, level.name, level.description, levelIndex + 1,
                level.minimumMonthsExperience, level.requirements ?? null],
        );
        const levelId = result.rows[0]?.id;
        if (!levelId) throw new Error("Falha ao criar nível da trilha de carreira.");
        for (const [index, competency] of level.competencies.entries()) {
            await client.query(
                `INSERT INTO career_level_competencies (
                    level_id, name, description, category, required_level, position
                 ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [levelId, competency.name, competency.description, competency.category,
                    competency.requiredLevel, index + 1],
            );
        }
        for (const training of level.trainings) {
            await client.query(
                `INSERT INTO career_level_trainings (level_id, training_id, required)
                 VALUES ($1, $2, $3)`,
                [levelId, training.trainingId, training.required],
            );
        }
    }
};

const profileQuery = `
    SELECT employee_career_profiles.id, employee_career_profiles.company_id,
           employee_career_profiles.employee_id, employees.full_name AS employee_name,
           employees.department_id, employee_career_profiles.track_id,
           career_tracks.code AS track_code, career_tracks.name AS track_name,
           employee_career_profiles.current_level_id,
           current_level.name AS current_level_name,
           employee_career_profiles.target_level_id, target_level.name AS target_level_name,
           employee_career_profiles.readiness_percent, employee_career_profiles.manager_notes,
           employee_career_profiles.created_at, employee_career_profiles.updated_at
    FROM employee_career_profiles
    INNER JOIN employees ON employees.id = employee_career_profiles.employee_id
    INNER JOIN career_tracks ON career_tracks.id = employee_career_profiles.track_id
    LEFT JOIN career_levels AS current_level
        ON current_level.id = employee_career_profiles.current_level_id
    LEFT JOIN career_levels AS target_level
        ON target_level.id = employee_career_profiles.target_level_id
`;

export class CareerRepository {
    async listTracks(
        companyId: string, scopeDepartmentId: string | undefined,
        query: CareerTrackListQuery,
    ): Promise<PaginatedResult<CareerTrack>> {
        const result = await database.query<TrackRow>(
            `SELECT ${trackColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM career_tracks LEFT JOIN departments ON departments.id = career_tracks.department_id
             WHERE career_tracks.company_id = $1 AND career_tracks.deleted_at IS NULL
               AND ($2::UUID IS NULL OR career_tracks.department_id IS NULL
                    OR career_tracks.department_id = $2)
               AND ($3::TEXT IS NULL OR career_tracks.code ILIKE '%' || $3 || '%'
                    OR career_tracks.name ILIKE '%' || $3 || '%')
               AND ($4::UUID IS NULL OR career_tracks.department_id = $4)
               AND ($5::TEXT IS NULL OR career_tracks.status::TEXT = $5)
             ORDER BY career_tracks.updated_at DESC
             LIMIT $6 OFFSET $7`,
            [companyId, scopeDepartmentId ?? null, query.search ?? null,
                query.departmentId ?? null, query.status ?? null, query.pageSize,
                (query.page - 1) * query.pageSize],
        );
        return { items: result.rows.map((row) => mapTrack(row)),
            total: result.rows[0]?.total ?? 0 };
    }

    async findTrack(
        companyId: string, trackId: string, scopeDepartmentId?: string,
    ): Promise<CareerTrack | null> {
        const result = await database.query<TrackRow>(
            `SELECT ${trackColumns}
             FROM career_tracks LEFT JOIN departments ON departments.id = career_tracks.department_id
             WHERE career_tracks.company_id = $1 AND career_tracks.id = $2
               AND career_tracks.deleted_at IS NULL
               AND ($3::UUID IS NULL OR career_tracks.department_id IS NULL
                    OR career_tracks.department_id = $3)`,
            [companyId, trackId, scopeDepartmentId ?? null],
        );
        const row = result.rows[0];
        if (!row) return null;
        const [levels, competencies, trainings] = await Promise.all([
            database.query<LevelRow>(
                `SELECT career_levels.id, career_levels.position_id,
                        positions.title AS position_title, career_levels.name,
                        career_levels.description, career_levels.level_number,
                        career_levels.minimum_months_experience, career_levels.requirements
                 FROM career_levels INNER JOIN positions ON positions.id = career_levels.position_id
                 WHERE career_levels.track_id = $1 ORDER BY career_levels.level_number`, [trackId]),
            database.query<CompetencyRow>(
                `SELECT career_level_competencies.id, career_level_competencies.level_id,
                        career_level_competencies.name, career_level_competencies.description,
                        career_level_competencies.category,
                        career_level_competencies.required_level,
                        career_level_competencies.position
                 FROM career_level_competencies INNER JOIN career_levels
                    ON career_levels.id = career_level_competencies.level_id
                 WHERE career_levels.track_id = $1 ORDER BY career_levels.level_number,
                    career_level_competencies.position`, [trackId]),
            database.query<TrainingRow>(
                `SELECT career_level_trainings.level_id, career_level_trainings.training_id,
                        trainings.code AS training_code, trainings.title AS training_title,
                        career_level_trainings.required
                 FROM career_level_trainings INNER JOIN career_levels
                    ON career_levels.id = career_level_trainings.level_id
                 INNER JOIN trainings ON trainings.id = career_level_trainings.training_id
                 WHERE career_levels.track_id = $1`, [trackId]),
        ]);
        return mapTrack(row, levels.rows.map((level) => ({
            id: level.id, positionId: level.position_id, positionTitle: level.position_title,
            name: level.name, description: level.description, levelNumber: level.level_number,
            minimumMonthsExperience: level.minimum_months_experience,
            requirements: level.requirements,
            competencies: competencies.rows.filter((item) => item.level_id === level.id)
                .map((item) => ({ id: item.id, name: item.name,
                    description: item.description, category: item.category,
                    requiredLevel: Number(item.required_level), position: item.position })),
            trainings: trainings.rows.filter((item) => item.level_id === level.id)
                .map((item) => ({ trainingId: item.training_id,
                    trainingCode: item.training_code, trainingTitle: item.training_title,
                    required: item.required })),
        })));
    }

    async createTrack(
        companyId: string, departmentId: string | null,
        input: CreateCareerTrackInput, actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO career_tracks (
                    company_id, department_id, code, name, description, status,
                    created_by, updated_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
                [companyId, departmentId, input.code, input.name, input.description,
                    input.status, actor.userId],
            );
            const id = result.rows[0]?.id;
            if (!id) throw new Error("Falha ao criar trilha de carreira.");
            await insertLevels(client, id, input.levels);
            await addAuditLog(client, companyId, actor, "career.track.created",
                "career_track", id);
            await client.query("COMMIT"); return id;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async updateTrack(
        companyId: string, trackId: string, input: UpdateCareerTrackInput,
        departmentId: string | null | undefined, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const fields: string[] = [];
            const values: unknown[] = [companyId, trackId];
            const add = (column: string, value: unknown): void => {
                values.push(value); fields.push(`${column} = $${values.length}`);
            };
            if (departmentId !== undefined) add("department_id", departmentId);
            if (input.code !== undefined) add("code", input.code);
            if (input.name !== undefined) add("name", input.name);
            if (input.description !== undefined) add("description", input.description);
            if (input.status !== undefined) add("status", input.status);
            add("updated_by", actor.userId);
            const result = await client.query(
                `UPDATE career_tracks SET ${fields.join(", ")}
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`, values,
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            if (input.levels) {
                await client.query("DELETE FROM career_levels WHERE track_id = $1", [trackId]);
                await insertLevels(client, trackId, input.levels);
            }
            await addAuditLog(client, companyId, actor, "career.track.updated",
                "career_track", trackId, { changedFields: Object.keys(input) });
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async archiveTrack(
        companyId: string, trackId: string, actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query(
                `UPDATE career_tracks SET status = 'archived', deleted_at = NOW(), updated_by = $3
                 WHERE company_id = $1 AND id = $2 AND deleted_at IS NULL`,
                [companyId, trackId, actor.userId],
            );
            if (result.rowCount === 0) { await client.query("ROLLBACK"); return false; }
            await addAuditLog(client, companyId, actor, "career.track.archived",
                "career_track", trackId);
            await client.query("COMMIT"); return true;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }

    async findProfile(companyId: string, employeeId: string): Promise<CareerProfile | null> {
        const result = await database.query<ProfileRow>(
            `${profileQuery}
             WHERE employee_career_profiles.company_id = $1
               AND employee_career_profiles.employee_id = $2`,
            [companyId, employeeId],
        );
        return result.rows[0] ? mapProfile(result.rows[0]) : null;
    }

    async upsertProfile(
        companyId: string, employeeId: string, input: UpsertCareerProfileInput,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO employee_career_profiles (
                    company_id, employee_id, track_id, current_level_id, target_level_id,
                    readiness_percent, manager_notes, updated_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                 ON CONFLICT (employee_id) DO UPDATE SET
                    track_id = EXCLUDED.track_id,
                    current_level_id = EXCLUDED.current_level_id,
                    target_level_id = EXCLUDED.target_level_id,
                    readiness_percent = EXCLUDED.readiness_percent,
                    manager_notes = EXCLUDED.manager_notes,
                    updated_by = EXCLUDED.updated_by
                 RETURNING id`,
                [companyId, employeeId, input.trackId, input.currentLevelId ?? null,
                    input.targetLevelId ?? null, input.readinessPercent ?? 0,
                    input.managerNotes ?? null, actor.userId],
            );
            const id = result.rows[0]?.id;
            if (!id) throw new Error("Falha ao atualizar perfil de carreira.");
            await addAuditLog(client, companyId, actor, "career.profile.updated",
                "career_profile", id, { employeeId });
            await client.query("COMMIT"); return id;
        } catch (error) {
            await client.query("ROLLBACK"); throw error;
        } finally { client.release(); }
    }
}

export const careerRepository = new CareerRepository();
