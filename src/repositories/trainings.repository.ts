import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import database from "../database/connection.js";
import type { AuthenticationContext } from "./auth.repository.js";
import type { AuditActor, PaginatedResult } from "./organization.repository.js";
import type {
    CreateTrainingClassInput,
    CreateTrainingInput,
    MyTrainingListQuery,
    TrainingClassListQuery,
    TrainingEnrollmentListQuery,
    TrainingListQuery,
    UpdateTrainingInput,
    UpsertTrainingExamInput,
} from "../schemas/trainings.schemas.js";

export interface TrainingMaterial {
    title: string;
    type: "video" | "document" | "link" | "text";
    url?: string | null;
    content?: string | null;
}

export interface Training {
    id: string;
    companyId: string;
    departmentId: string | null;
    departmentName: string | null;
    code: string;
    title: string;
    description: string;
    objectives: string | null;
    instructor: string | null;
    modality: "online" | "in_person" | "hybrid";
    workloadMinutes: number;
    coverUrl: string | null;
    materials: TrainingMaterial[];
    status: "draft" | "published" | "archived";
    classCount: number;
    enrollmentCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface TrainingClass {
    id: string;
    companyId: string;
    trainingId: string;
    trainingCode: string;
    trainingTitle: string;
    trainingStatus: Training["status"];
    departmentId: string | null;
    departmentName: string | null;
    name: string;
    status: "draft" | "open" | "in_progress" | "completed" | "cancelled";
    startsAt: Date;
    endsAt: Date;
    enrollmentDeadline: Date | null;
    capacity: number | null;
    location: string | null;
    meetingUrl: string | null;
    calendarEventId: string | null;
    enrollmentCount: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface TrainingEnrollment {
    id: string;
    companyId: string;
    classId: string;
    className: string;
    trainingId: string;
    trainingCode: string;
    trainingTitle: string;
    trainingDescription: string;
    modality: Training["modality"];
    workloadMinutes: number;
    materials: TrainingMaterial[];
    classStatus: TrainingClass["status"];
    startsAt: Date;
    endsAt: Date;
    employeeId: string;
    employeeName: string;
    employeeEmail: string;
    status: "assigned" | "in_progress" | "completed" | "failed" | "cancelled";
    progressPercent: number;
    bestScore: number | null;
    examId: string | null;
    examPublished: boolean;
    attemptCount: number;
    maxAttempts: number | null;
    enrolledAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}

export interface TrainingExamOption {
    id: string;
    text: string;
    isCorrect: boolean;
}

export interface TrainingExamQuestion {
    id: string;
    prompt: string;
    questionType: "single_choice" | "multiple_choice" | "true_false";
    points: number;
    position: number;
    options: TrainingExamOption[];
}

export interface TrainingExam {
    id: string;
    companyId: string;
    trainingId: string;
    title: string;
    instructions: string | null;
    passingScore: number;
    maxAttempts: number;
    timeLimitMinutes: number | null;
    published: boolean;
    questions: TrainingExamQuestion[];
    createdAt: Date;
    updatedAt: Date;
}

export interface GradedAnswer {
    questionId: string;
    selectedOptionIds: string[];
    correct: boolean;
    awardedPoints: number;
}

export interface TrainingAttempt {
    id: string;
    examId: string;
    enrollmentId: string;
    attemptNumber: number;
    score: number;
    passed: boolean;
    answers: GradedAnswer[];
    submittedAt: Date;
}

export interface TrainingDashboardMetrics {
    publishedTrainings: number;
    activeClasses: number;
    myPendingTrainings: number;
    completionRate: number;
}

export interface ResolvedTrainingClassInput {
    departmentId: string | null;
    name: string;
    status: TrainingClass["status"];
    startsAt: string;
    endsAt: string;
    enrollmentDeadline: string | null;
    capacity: number | null;
    location: string | null;
    meetingUrl: string | null;
}

interface TrainingRow {
    id: string;
    company_id: string;
    department_id: string | null;
    department_name: string | null;
    code: string;
    title: string;
    description: string;
    objectives: string | null;
    instructor: string | null;
    modality: Training["modality"];
    workload_minutes: number;
    cover_url: string | null;
    materials: TrainingMaterial[];
    status: Training["status"];
    class_count: number;
    enrollment_count: number;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

interface TrainingClassRow {
    id: string;
    company_id: string;
    training_id: string;
    training_code: string;
    training_title: string;
    training_status: Training["status"];
    department_id: string | null;
    department_name: string | null;
    name: string;
    status: TrainingClass["status"];
    starts_at: Date;
    ends_at: Date;
    enrollment_deadline: Date | null;

    capacity: number | null;
    location: string | null;
    meeting_url: string | null;
    calendar_event_id: string | null;
    enrollment_count: number;
    created_at: Date;
    updated_at: Date;
    total?: number;
}

interface TrainingEnrollmentRow {
    id: string;
    company_id: string;
    class_id: string;
    class_name: string;
    training_id: string;
    training_code: string;
    training_title: string;
    training_description: string;
    modality: Training["modality"];
    workload_minutes: number;
    materials: TrainingMaterial[];
    class_status: TrainingClass["status"];
    starts_at: Date;
    ends_at: Date;
    employee_id: string;
    employee_name: string;
    employee_email: string;
    status: TrainingEnrollment["status"];
    progress_percent: string;
    best_score: string | null;
    exam_id: string | null;
    exam_published: boolean | null;
    attempt_count: number;
    max_attempts: number | null;
    enrolled_at: Date;
    started_at: Date | null;
    completed_at: Date | null;
    total?: number;
}

interface TrainingExamRow {
    id: string;
    company_id: string;
    training_id: string;
    title: string;
    instructions: string | null;
    passing_score: string;
    max_attempts: number;
    time_limit_minutes: number | null;
    published: boolean;
    created_at: Date;
    updated_at: Date;
}

interface TrainingExamQuestionRow {
    id: string;
    prompt: string;
    question_type: TrainingExamQuestion["questionType"];
    points: string;
    position: number;
    options: TrainingExamOption[];
}

interface TrainingAttemptRow {
    id: string;
    exam_id: string;
    enrollment_id: string;
    attempt_number: number;
    score: string;
    passed: boolean;
    answers: GradedAnswer[];
    submitted_at: Date;
}

const trainingColumns = `
    trainings.id, trainings.company_id, trainings.department_id,
    departments.name AS department_name, trainings.code, trainings.title,
    trainings.description, trainings.objectives, trainings.instructor,
    trainings.modality, trainings.workload_minutes, trainings.cover_url,
    trainings.materials, trainings.status, trainings.created_at, trainings.updated_at,
    COALESCE(training_stats.class_count, 0)::INTEGER AS class_count,
    COALESCE(training_stats.enrollment_count, 0)::INTEGER AS enrollment_count
`;

const trainingJoins = `
    LEFT JOIN departments ON departments.id = trainings.department_id
    LEFT JOIN LATERAL (
        SELECT
            COUNT(DISTINCT training_classes.id)::INTEGER AS class_count,
            COUNT(training_enrollments.id)::INTEGER AS enrollment_count
        FROM training_classes
        LEFT JOIN training_enrollments
            ON training_enrollments.class_id = training_classes.id
           AND training_enrollments.deleted_at IS NULL
        WHERE training_classes.training_id = trainings.id
          AND training_classes.deleted_at IS NULL
    ) AS training_stats ON TRUE
`;
const classColumns = `
    training_classes.id, training_classes.company_id, training_classes.training_id,
    trainings.code AS training_code, trainings.title AS training_title,
    trainings.status AS training_status, training_classes.department_id,
    departments.name AS department_name, training_classes.name,
    training_classes.status, training_classes.starts_at, training_classes.ends_at,
    training_classes.enrollment_deadline, training_classes.capacity,
    training_classes.location, training_classes.meeting_url,
    training_classes.calendar_event_id, training_classes.created_at,
    training_classes.updated_at,
    (SELECT COUNT(*)::INTEGER FROM training_enrollments
     WHERE training_enrollments.class_id = training_classes.id
       AND training_enrollments.deleted_at IS NULL
       AND training_enrollments.status <> 'cancelled') AS enrollment_count
`;

const classJoins = `
    INNER JOIN trainings ON trainings.id = training_classes.training_id
    LEFT JOIN departments ON departments.id = training_classes.department_id
`;

const enrollmentColumns = `
    training_enrollments.id, training_enrollments.company_id,
    training_enrollments.class_id, training_classes.name AS class_name,
    trainings.id AS training_id, trainings.code AS training_code,
    trainings.title AS training_title, trainings.description AS training_description,
    trainings.modality, trainings.workload_minutes, trainings.materials,
    training_classes.status AS class_status, training_classes.starts_at,
    training_classes.ends_at, training_enrollments.employee_id,
    employees.full_name AS employee_name, employees.email AS employee_email,
    training_enrollments.status, training_enrollments.progress_percent,
    training_enrollments.best_score, training_exams.id AS exam_id,
    training_exams.published AS exam_published, training_exams.max_attempts,
    (SELECT COUNT(*)::INTEGER FROM training_exam_attempts
     WHERE training_exam_attempts.enrollment_id = training_enrollments.id) AS attempt_count,
    training_enrollments.enrolled_at, training_enrollments.started_at,
    training_enrollments.completed_at
`;

const enrollmentJoins = `
    INNER JOIN training_classes ON training_classes.id = training_enrollments.class_id
    INNER JOIN trainings ON trainings.id = training_classes.training_id
    INNER JOIN employees ON employees.id = training_enrollments.employee_id
    LEFT JOIN training_exams
        ON training_exams.training_id = trainings.id
       AND training_exams.deleted_at IS NULL
`;

const mapTraining = (row: TrainingRow): Training => ({
    id: row.id,
    companyId: row.company_id,
    departmentId: row.department_id,
    departmentName: row.department_name,
    code: row.code,
    title: row.title,
    description: row.description,
    objectives: row.objectives,
    instructor: row.instructor,
    modality: row.modality,
    workloadMinutes: row.workload_minutes,
    coverUrl: row.cover_url,
    materials: row.materials,
    status: row.status,
    classCount: row.class_count,
    enrollmentCount: row.enrollment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapClass = (row: TrainingClassRow): TrainingClass => ({
    id: row.id,
    companyId: row.company_id,
    trainingId: row.training_id,
    trainingCode: row.training_code,
    trainingTitle: row.training_title,
    trainingStatus: row.training_status,
    departmentId: row.department_id,
    departmentName: row.department_name,
    name: row.name,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    enrollmentDeadline: row.enrollment_deadline,
    capacity: row.capacity,
    location: row.location,
    meetingUrl: row.meeting_url,
    calendarEventId: row.calendar_event_id,
    enrollmentCount: row.enrollment_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapEnrollment = (row: TrainingEnrollmentRow): TrainingEnrollment => ({
    id: row.id,
    companyId: row.company_id,
    classId: row.class_id,
    className: row.class_name,
    trainingId: row.training_id,
    trainingCode: row.training_code,
    trainingTitle: row.training_title,
    trainingDescription: row.training_description,

    modality: row.modality,
    workloadMinutes: row.workload_minutes,
    materials: row.materials,
    classStatus: row.class_status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    status: row.status,
    progressPercent: Number(row.progress_percent),
    bestScore: row.best_score === null ? null : Number(row.best_score),
    examId: row.exam_id,
    examPublished: row.exam_published ?? false,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    enrolledAt: row.enrolled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
});

const mapExam = (
    row: TrainingExamRow,
    questions: TrainingExamQuestionRow[],
): TrainingExam => ({
    id: row.id,
    companyId: row.company_id,
    trainingId: row.training_id,
    title: row.title,
    instructions: row.instructions,
    passingScore: Number(row.passing_score),
    maxAttempts: row.max_attempts,
    timeLimitMinutes: row.time_limit_minutes,
    published: row.published,
    questions: questions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        questionType: question.question_type,
        points: Number(question.points),
        position: question.position,
        options: question.options,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

const mapAttempt = (row: TrainingAttemptRow): TrainingAttempt => ({
    id: row.id,
    examId: row.exam_id,
    enrollmentId: row.enrollment_id,
    attemptNumber: row.attempt_number,
    score: Number(row.score),
    passed: row.passed,
    answers: row.answers,
    submittedAt: row.submitted_at,
});

const addAuditLog = async (
    client: PoolClient,
    companyId: string,
    actor: AuditActor,
    event: string,
    entityType: string,
    entityId: string,
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

const classCalendarVisibility = (
    status: TrainingClass["status"],
    departmentId: string | null,
): "company" | "department" | "participants" => {
    if (status === "draft") return "participants";
    return departmentId ? "department" : "company";
};

const classCalendarStatus = (
    status: TrainingClass["status"],
): "scheduled" | "completed" | "cancelled" => {
    if (status === "completed") return "completed";
    if (status === "cancelled") return "cancelled";
    return "scheduled";
};

export class TrainingsRepository {
    async listTrainings(
        companyId: string,
        scopeDepartmentId: string | undefined,
        query: TrainingListQuery,
    ): Promise<PaginatedResult<Training>> {
        const values: unknown[] = [companyId, scopeDepartmentId ?? null];
        const conditions = [
            "trainings.company_id = $1",
            "trainings.deleted_at IS NULL",
            "($2::UUID IS NULL OR trainings.department_id IS NULL OR trainings.department_id = $2)",
        ];
        if (query.search) {
            values.push(`%${query.search}%`);
            conditions.push(`(trainings.title ILIKE $${values.length}
                OR trainings.code ILIKE $${values.length}
                OR trainings.instructor ILIKE $${values.length})`);
        }
        if (query.departmentId) {
            values.push(query.departmentId);
            conditions.push(`trainings.department_id = $${values.length}`);
        }
        if (query.modality) {
            values.push(query.modality);
            conditions.push(`trainings.modality = $${values.length}`);
        }
        if (query.status) {
            values.push(query.status);
            conditions.push(`trainings.status = $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<TrainingRow>(
            `SELECT ${trainingColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM trainings
             ${trainingJoins}
             WHERE ${conditions.join(" AND ")}
             ORDER BY trainings.created_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return { items: result.rows.map(mapTraining), total: result.rows[0]?.total ?? 0 };
    }

    async findTraining(
        companyId: string,
        trainingId: string,
        scopeDepartmentId?: string,
    ): Promise<Training | null> {
        const result = await database.query<TrainingRow>(
            `SELECT ${trainingColumns}
             FROM trainings
             ${trainingJoins}
             WHERE trainings.company_id = $1
               AND trainings.id = $2
               AND trainings.deleted_at IS NULL
               AND ($3::UUID IS NULL OR trainings.department_id IS NULL
                    OR trainings.department_id = $3)
             LIMIT 1`,
            [companyId, trainingId, scopeDepartmentId ?? null],
        );
        return result.rows[0] ? mapTraining(result.rows[0]) : null;
    }

    async createTraining(
        companyId: string,
        input: CreateTrainingInput,
        departmentId: string | null,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `INSERT INTO trainings (
                    company_id, department_id, code, title, description, objectives,
                    instructor, modality, workload_minutes, cover_url, materials,
                    status, created_by, updated_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::JSONB, $12, $13, $13)
                 RETURNING id`,
                [companyId, departmentId, input.code, input.title, input.description,
                    input.objectives ?? null, input.instructor ?? null, input.modality,
                    input.workloadMinutes, input.coverUrl ?? null,
                    JSON.stringify(input.materials), input.status, actor.userId],
            );
            const id = result.rows[0].id;
            await addAuditLog(client, companyId, actor, "training.created", "training", id);
            await client.query("COMMIT");
            return id;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateTraining(
        companyId: string,
        trainingId: string,
        input: UpdateTrainingInput,
        departmentId: string | null | undefined,
        actor: AuditActor,
    ): Promise<boolean> {
        const values: unknown[] = [];
        const assignments: string[] = [];
        const columns: Record<string, string> = {
            code: "code",
            title: "title",
            description: "description",
            objectives: "objectives",
            instructor: "instructor",
            modality: "modality",
            workloadMinutes: "workload_minutes",
            coverUrl: "cover_url",
            status: "status",
        };
        for (const [field, column] of Object.entries(columns)) {
            const value = input[field as keyof UpdateTrainingInput];
            if (value !== undefined) {
                values.push(value);
                assignments.push(`${column} = $${values.length}`);
            }
        }
        if (input.materials !== undefined) {
            values.push(JSON.stringify(input.materials));
            assignments.push(`materials = $${values.length}::JSONB`);
        }
        if (departmentId !== undefined) {
            values.push(departmentId);
            assignments.push(`department_id = $${values.length}`);
        }
        values.push(actor.userId, trainingId, companyId);
        assignments.push(`updated_by = $${values.length - 2}`);

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE trainings SET ${assignments.join(", ")}
                 WHERE id = $${values.length - 1}
                   AND company_id = $${values.length}
                   AND deleted_at IS NULL
                 RETURNING id`,
                values,
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "training.updated",
                    "training",
                    trainingId,
                    { changedFields: Object.keys(input) },
                );
            }
            await client.query("COMMIT");
            return Boolean(result.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async countActiveClasses(companyId: string, trainingId: string): Promise<number> {
        const result = await database.query<{ total: number }>(
            `SELECT COUNT(*)::INTEGER AS total
             FROM training_classes
             WHERE company_id = $1
               AND training_id = $2
               AND status IN ('open', 'in_progress')
               AND deleted_at IS NULL`,
            [companyId, trainingId],
        );
        return result.rows[0]?.total ?? 0;
    }

    async archiveTraining(
        companyId: string,
        trainingId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ id: string }>(
                `UPDATE trainings
                 SET status = 'archived', deleted_at = NOW(), updated_by = $3
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 RETURNING id`,
                [trainingId, companyId, actor.userId],
            );
            if (result.rows[0]) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "training.archived",
                    "training",
                    trainingId,
                );
            }
            await client.query("COMMIT");
            return Boolean(result.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listClasses(
        companyId: string,
        scopeDepartmentId: string | undefined,
        query: TrainingClassListQuery,
    ): Promise<PaginatedResult<TrainingClass>> {
        const values: unknown[] = [companyId];
        const conditions = [
            "training_classes.company_id = $1",
            "training_classes.deleted_at IS NULL",
            "trainings.deleted_at IS NULL",
        ];
        if (scopeDepartmentId) {
            values.push(scopeDepartmentId);
            conditions.push(
                `(training_classes.department_id IS NULL
                  OR training_classes.department_id = $${values.length})`,
            );
        }
        if (query.trainingId) {
            values.push(query.trainingId);
            conditions.push(`training_classes.training_id = $${values.length}`);
        }
        if (query.departmentId) {
            values.push(query.departmentId);
            conditions.push(`training_classes.department_id = $${values.length}`);
        }
        if (query.status) {
            values.push(query.status);
            conditions.push(`training_classes.status = $${values.length}`);
        }
        if (query.from) {
            values.push(query.from);
            conditions.push(`training_classes.ends_at >= $${values.length}`);
        }
        if (query.to) {
            values.push(query.to);
            conditions.push(`training_classes.starts_at < $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<TrainingClassRow>(
            `SELECT ${classColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM training_classes ${classJoins}
             WHERE ${conditions.join(" AND ")}
             ORDER BY training_classes.starts_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return { items: result.rows.map(mapClass), total: result.rows[0]?.total ?? 0 };
    }

    async findClass(
        companyId: string,
        classId: string,
        scopeDepartmentId?: string,
    ): Promise<TrainingClass | null> {
        const result = await database.query<TrainingClassRow>(
            `SELECT ${classColumns}
             FROM training_classes ${classJoins}
             WHERE training_classes.company_id = $1
               AND training_classes.id = $2
               AND training_classes.deleted_at IS NULL
               AND trainings.deleted_at IS NULL
               AND ($3::UUID IS NULL OR training_classes.department_id IS NULL
                    OR training_classes.department_id = $3)
             LIMIT 1`,
            [companyId, classId, scopeDepartmentId ?? null],
        );
        return result.rows[0] ? mapClass(result.rows[0]) : null;
    }

    async createClass(
        context: AuthenticationContext,
        training: Training,
        input: CreateTrainingClassInput,
        departmentId: string | null,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const calendarTitle = `${training.title} - ${input.name}`.slice(0, 180);
            const eventResult = await client.query<{ id: string }>(
                `INSERT INTO calendar_events (
                    company_id, department_id, title, description, event_type,
                    visibility, status, location, meeting_url, starts_at, ends_at,
                    all_day, created_by, updated_by
                 ) VALUES (
                    $1, $2, $3, $4, 'training', $5, $6, $7, $8, $9, $10,
                    FALSE, $11, $11
                 ) RETURNING id`,
                [
                    context.companyId,
                    departmentId,
                    calendarTitle,
                    training.description,
                    classCalendarVisibility(input.status, departmentId),
                    classCalendarStatus(input.status),
                    input.location ?? null,
                    input.meetingUrl ?? null,
                    input.startsAt,
                    input.endsAt,
                    actor.userId,
                ],
            );
            const eventId = eventResult.rows[0].id;
            const result = await client.query<{ id: string }>(
                `INSERT INTO training_classes (
                    company_id, training_id, department_id, name, status,
                    starts_at, ends_at, enrollment_deadline, capacity, location,
                    meeting_url, calendar_event_id, created_by, updated_by
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13
                 ) RETURNING id`,
                [
                    context.companyId,
                    training.id,
                    departmentId,
                    input.name,
                    input.status,
                    input.startsAt,
                    input.endsAt,
                    input.enrollmentDeadline ?? null,
                    input.capacity ?? null,
                    input.location ?? null,
                    input.meetingUrl ?? null,
                    eventId,
                    actor.userId,
                ],
            );
            const classId = result.rows[0].id;
            await addAuditLog(
                client,
                context.companyId,
                actor,
                "training.class.created",
                "training_class",
                classId,
                { trainingId: training.id, calendarEventId: eventId },
            );
            await client.query("COMMIT");
            return classId;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateClass(
        companyId: string,
        classId: string,
        trainingTitle: string,
        input: ResolvedTrainingClassInput,
        changedFields: string[],
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const current = await client.query<{ calendar_event_id: string | null }>(
                `SELECT calendar_event_id
                 FROM training_classes
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 FOR UPDATE`,
                [classId, companyId],
            );
            const row = current.rows[0];
            if (!row) {
                await client.query("ROLLBACK");
                return false;
            }
            await client.query(
                `UPDATE training_classes SET
                    department_id = $3, name = $4, status = $5, starts_at = $6,
                    ends_at = $7, enrollment_deadline = $8, capacity = $9,
                    location = $10, meeting_url = $11, updated_by = $12
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
                [
                    classId,
                    companyId,
                    input.departmentId,
                    input.name,
                    input.status,
                    input.startsAt,
                    input.endsAt,
                    input.enrollmentDeadline,
                    input.capacity,
                    input.location,
                    input.meetingUrl,
                    actor.userId,
                ],
            );
            if (row.calendar_event_id) {
                const calendarTitle = `${trainingTitle} - ${input.name}`.slice(0, 180);
                await client.query(
                    `UPDATE calendar_events SET
                        department_id = $3, title = $4, visibility = $5, status = $6,
                        location = $7, meeting_url = $8, starts_at = $9, ends_at = $10,
                        updated_by = $11
                     WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
                    [
                        row.calendar_event_id,
                        companyId,
                        input.departmentId,
                        calendarTitle,
                        classCalendarVisibility(input.status, input.departmentId),
                        classCalendarStatus(input.status),
                        input.location,
                        input.meetingUrl,
                        input.startsAt,
                        input.endsAt,
                        actor.userId,
                    ],
                );
            }
            await addAuditLog(
                client,
                companyId,
                actor,
                "training.class.updated",
                "training_class",
                classId,
                { changedFields },
            );
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async archiveClass(
        companyId: string,
        classId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ calendar_event_id: string | null }>(
                `UPDATE training_classes
                 SET deleted_at = NOW(), updated_by = $3
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 RETURNING calendar_event_id`,
                [classId, companyId, actor.userId],
            );
            const row = result.rows[0];
            if (row?.calendar_event_id) {
                await client.query(
                    `UPDATE calendar_events
                     SET status = 'cancelled', deleted_at = NOW(), updated_by = $3
                     WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL`,
                    [row.calendar_event_id, companyId, actor.userId],
                );
            }
            if (row) {
                await addAuditLog(
                    client,
                    companyId,
                    actor,
                    "training.class.archived",
                    "training_class",
                    classId,
                );
            }
            await client.query("COMMIT");
            return Boolean(row);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async findActiveEmployeeIds(
        companyId: string,
        employeeIds: string[],
        scopeDepartmentId?: string,
    ): Promise<string[]> {
        const result = await database.query<{ id: string }>(
            `SELECT id FROM employees
             WHERE company_id = $1 AND id = ANY($2::UUID[])
               AND status <> 'inactive' AND deleted_at IS NULL
               AND ($3::UUID IS NULL OR department_id = $3)`,
            [companyId, employeeIds, scopeDepartmentId ?? null],
        );
        return result.rows.map((row) => row.id);
    }

    async assignEnrollments(
        companyId: string,
        classId: string,
        employeeIds: string[],
        actor: AuditActor,
    ): Promise<number> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const classResult = await client.query<{
                capacity: number | null;
                calendar_event_id: string | null;
                enrolled: number;
            }>(
                `SELECT training_classes.capacity, training_classes.calendar_event_id,
                    (SELECT COUNT(*)::INTEGER FROM training_enrollments
                     WHERE class_id = training_classes.id AND deleted_at IS NULL
                       AND status <> 'cancelled') AS enrolled
                 FROM training_classes
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 FOR UPDATE`,
                [classId, companyId],
            );
            const trainingClass = classResult.rows[0];
            if (!trainingClass) {
                await client.query("ROLLBACK");
                return 0;
            }
            if (trainingClass.capacity !== null
                && trainingClass.enrolled + employeeIds.length > trainingClass.capacity) {
                const error = new Error("TRAINING_CLASS_CAPACITY_EXCEEDED");
                error.name = "TrainingCapacityError";
                throw error;
            }
            const result = await client.query<{ employee_id: string }>(
                `INSERT INTO training_enrollments (
                    company_id, class_id, employee_id, enrolled_by
                 ) SELECT $1, $2, employee_id, $3
                   FROM UNNEST($4::UUID[]) AS employee_id
                 ON CONFLICT (class_id, employee_id) WHERE deleted_at IS NULL DO NOTHING
                 RETURNING employee_id`,
                [companyId, classId, actor.userId, employeeIds],
            );
            const insertedIds = result.rows.map((row) => row.employee_id);
            if (trainingClass.calendar_event_id && insertedIds.length > 0) {
                await client.query(
                    `INSERT INTO calendar_event_attendees (event_id, employee_id)
                     SELECT $1, employee_id FROM UNNEST($2::UUID[]) AS employee_id
                     ON CONFLICT (event_id, employee_id) DO NOTHING`,
                    [trainingClass.calendar_event_id, insertedIds],
                );
            }
            await addAuditLog(client, companyId, actor, "training.enrollments.assigned",
                "training_class", classId, { employeeIds: insertedIds });
            await client.query("COMMIT");
            return insertedIds.length;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listEnrollments(
        companyId: string,
        classId: string,
        query: TrainingEnrollmentListQuery,
    ): Promise<PaginatedResult<TrainingEnrollment>> {
        const values: unknown[] = [companyId, classId];
        const conditions = [
            "training_enrollments.company_id = $1",
            "training_enrollments.class_id = $2",
            "training_enrollments.deleted_at IS NULL",
        ];
        if (query.status) {
            values.push(query.status);
            conditions.push(`training_enrollments.status = $${values.length}`);
        }
        if (query.employeeId) {
            values.push(query.employeeId);
            conditions.push(`training_enrollments.employee_id = $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<TrainingEnrollmentRow>(
            `SELECT ${enrollmentColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM training_enrollments ${enrollmentJoins}
             WHERE ${conditions.join(" AND ")}
             ORDER BY employees.full_name ASC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return { items: result.rows.map(mapEnrollment), total: result.rows[0]?.total ?? 0 };
    }

    async listMyEnrollments(
        companyId: string,
        employeeId: string,
        query: MyTrainingListQuery,
    ): Promise<PaginatedResult<TrainingEnrollment>> {
        const values: unknown[] = [companyId, employeeId];
        const conditions = [
            "training_enrollments.company_id = $1",
            "training_enrollments.employee_id = $2",
            "training_enrollments.deleted_at IS NULL",
            "trainings.deleted_at IS NULL",
        ];

        if (query.status) {
            values.push(query.status);
            conditions.push(`training_enrollments.status = $${values.length}`);
        }
        values.push(query.pageSize, (query.page - 1) * query.pageSize);
        const result = await database.query<TrainingEnrollmentRow>(
            `SELECT ${enrollmentColumns}, COUNT(*) OVER()::INTEGER AS total
             FROM training_enrollments ${enrollmentJoins}
             WHERE ${conditions.join(" AND ")}
             ORDER BY training_classes.starts_at DESC
             LIMIT $${values.length - 1} OFFSET $${values.length}`,
            values,
        );
        return { items: result.rows.map(mapEnrollment), total: result.rows[0]?.total ?? 0 };
    }

    async findEnrollment(companyId: string, enrollmentId: string): Promise<TrainingEnrollment | null> {
        const result = await database.query<TrainingEnrollmentRow>(
            `SELECT ${enrollmentColumns}
             FROM training_enrollments ${enrollmentJoins}
             WHERE training_enrollments.company_id = $1
               AND training_enrollments.id = $2
               AND training_enrollments.deleted_at IS NULL
             LIMIT 1`,
            [companyId, enrollmentId],
        );
        return result.rows[0] ? mapEnrollment(result.rows[0]) : null;
    }

    async cancelEnrollment(
        companyId: string,
        enrollmentId: string,
        actor: AuditActor,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{
                id: string;
                employee_id: string;
                calendar_event_id: string | null;
            }>(
                `UPDATE training_enrollments SET
                    status = 'cancelled', cancelled_at = NOW(), deleted_at = NOW()
                 FROM training_classes
                 WHERE training_enrollments.class_id = training_classes.id
                   AND training_enrollments.id = $1
                   AND training_enrollments.company_id = $2
                   AND training_enrollments.deleted_at IS NULL
                 RETURNING training_enrollments.id, training_enrollments.employee_id,
                           training_classes.calendar_event_id`,
                [enrollmentId, companyId],
            );
            const row = result.rows[0];
            if (row?.calendar_event_id) {
                await client.query(
                    `DELETE FROM calendar_event_attendees
                     WHERE event_id = $1 AND employee_id = $2`,
                    [row.calendar_event_id, row.employee_id],
                );
            }
            if (row) {
                await addAuditLog(client, companyId, actor, "training.enrollment.cancelled",
                    "training_enrollment", enrollmentId);
            }
            await client.query("COMMIT");
            return Boolean(row);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async updateProgress(
        companyId: string,
        enrollmentId: string,
        progressPercent: number,
        complete: boolean,
        actor: AuditActor,
    ): Promise<boolean> {
        const result = await database.query<{ id: string }>(
            `UPDATE training_enrollments SET
                progress_percent = $3,
                status = CASE WHEN $4 THEN 'completed'::training_enrollment_status
                              ELSE 'in_progress'::training_enrollment_status END,
                started_at = COALESCE(started_at, NOW()),
                completed_at = CASE WHEN $4 THEN COALESCE(completed_at, NOW()) ELSE NULL END
             WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
               AND status NOT IN ('completed', 'cancelled')
             RETURNING id`,
            [enrollmentId, companyId, progressPercent, complete],
        );
        if (result.rows[0]) {
            await database.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, request_id, context
                 ) VALUES ($1, $2, 'training.progress.updated', 'training_enrollment',
                    $3, $4, $5::JSONB)`,
                [companyId, actor.userId, enrollmentId, actor.requestId ?? null,
                    JSON.stringify({ progressPercent })],
            );
        }
        return Boolean(result.rows[0]);
    }

    async findExam(companyId: string, trainingId: string): Promise<TrainingExam | null> {
        const examResult = await database.query<TrainingExamRow>(
            `SELECT id, company_id, training_id, title, instructions, passing_score,
                    max_attempts, time_limit_minutes, published, created_at, updated_at
             FROM training_exams
             WHERE company_id = $1 AND training_id = $2 AND deleted_at IS NULL
             LIMIT 1`,
            [companyId, trainingId],
        );
        const exam = examResult.rows[0];
        if (!exam) return null;
        const questionResult = await database.query<TrainingExamQuestionRow>(
            `SELECT id, prompt, question_type, points, position, options
             FROM training_exam_questions
             WHERE exam_id = $1 ORDER BY position ASC`,
            [exam.id],
        );
        return mapExam(exam, questionResult.rows);
    }

    async upsertExam(
        companyId: string,
        trainingId: string,
        input: UpsertTrainingExamInput,
        actor: AuditActor,
    ): Promise<string> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const existing = await client.query<{ id: string }>(
                `SELECT id FROM training_exams
                 WHERE company_id = $1 AND training_id = $2 AND deleted_at IS NULL
                 FOR UPDATE`,
                [companyId, trainingId],
            );
            let examId = existing.rows[0]?.id;
            if (examId) {
                await client.query(
                    `UPDATE training_exams SET
                        title = $3, instructions = $4, passing_score = $5,
                        max_attempts = $6, time_limit_minutes = $7,
                        published = $8, updated_by = $9
                     WHERE id = $1 AND company_id = $2`,
                    [examId, companyId, input.title, input.instructions ?? null,
                        input.passingScore, input.maxAttempts, input.timeLimitMinutes ?? null,
                        input.published, actor.userId],
                );
                await client.query("DELETE FROM training_exam_questions WHERE exam_id = $1", [examId]);
            } else {
                const created = await client.query<{ id: string }>(
                    `INSERT INTO training_exams (
                        company_id, training_id, title, instructions, passing_score,
                        max_attempts, time_limit_minutes, published, created_by, updated_by
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
                     RETURNING id`,
                    [companyId, trainingId, input.title, input.instructions ?? null,
                        input.passingScore, input.maxAttempts, input.timeLimitMinutes ?? null,
                        input.published, actor.userId],
                );
                examId = created.rows[0].id;
            }
            for (const [index, question] of input.questions.entries()) {
                const options = question.options.map((option) => ({ id: randomUUID(), ...option }));
                await client.query(
                    `INSERT INTO training_exam_questions (
                        exam_id, prompt, question_type, points, position, options
                     ) VALUES ($1, $2, $3, $4, $5, $6::JSONB)`,
                    [examId, question.prompt, question.questionType, question.points,
                        index + 1, JSON.stringify(options)],
                );
            }
            await addAuditLog(client, companyId, actor,
                existing.rows[0] ? "training.exam.updated" : "training.exam.created",
                "training_exam", examId);
            await client.query("COMMIT");
            return examId;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async recordAttempt(
        companyId: string,
        enrollmentId: string,
        exam: TrainingExam,
        score: number,
        passed: boolean,
        answers: GradedAnswer[],
        actor: AuditActor,
    ): Promise<TrainingAttempt> {

        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `SELECT id FROM training_enrollments
                 WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL
                 FOR UPDATE`,
                [enrollmentId, companyId],
            );
            const countResult = await client.query<{ total: number }>(
                `SELECT COUNT(*)::INTEGER AS total FROM training_exam_attempts
                 WHERE exam_id = $1 AND enrollment_id = $2`,
                [exam.id, enrollmentId],
            );
            const attemptNumber = countResult.rows[0].total + 1;
            if (attemptNumber > exam.maxAttempts) {
                const error = new Error("TRAINING_EXAM_ATTEMPTS_EXHAUSTED");
                error.name = "TrainingAttemptsError";
                throw error;
            }
            const result = await client.query<TrainingAttemptRow>(
                `INSERT INTO training_exam_attempts (
                    company_id, exam_id, enrollment_id, attempt_number,
                    score, passed, answers
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7::JSONB)
                 RETURNING id, exam_id, enrollment_id, attempt_number, score,
                           passed, answers, submitted_at`,
                [companyId, exam.id, enrollmentId, attemptNumber, score, passed,
                    JSON.stringify(answers)],
            );
            const exhausted = !passed && attemptNumber >= exam.maxAttempts;
            await client.query(
                `UPDATE training_enrollments SET
                    best_score = GREATEST(COALESCE(best_score, 0), $3),
                    progress_percent = CASE WHEN $4 THEN 100 ELSE GREATEST(progress_percent, 1) END,
                    status = CASE
                        WHEN $4 THEN 'completed'::training_enrollment_status
                        WHEN $5 THEN 'failed'::training_enrollment_status
                        ELSE 'in_progress'::training_enrollment_status
                    END,
                    started_at = COALESCE(started_at, NOW()),
                    completed_at = CASE WHEN $4 THEN COALESCE(completed_at, NOW()) ELSE completed_at END
                 WHERE id = $1 AND company_id = $2`,
                [enrollmentId, companyId, score, passed, exhausted],
            );
            await addAuditLog(client, companyId, actor, "training.exam.submitted",
                "training_enrollment", enrollmentId,
                { examId: exam.id, attemptNumber, score, passed });
            await client.query("COMMIT");
            return mapAttempt(result.rows[0]);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async getDashboardMetrics(
        context: AuthenticationContext,
    ): Promise<TrainingDashboardMetrics> {
        const departmentScope = context.roles.includes("administrator")
            ? null
            : context.departmentId;
        const result = await database.query<{
            published_trainings: number;
            active_classes: number;
            my_pending_trainings: number;
            completion_rate: string;
        }>(
            `SELECT
                (SELECT COUNT(*)::INTEGER FROM trainings
                 WHERE company_id = $1 AND status = 'published' AND deleted_at IS NULL
                   AND ($2::UUID IS NULL OR department_id IS NULL OR department_id = $2)
                ) AS published_trainings,
                (SELECT COUNT(*)::INTEGER FROM training_classes
                 WHERE company_id = $1 AND status IN ('open', 'in_progress')
                   AND deleted_at IS NULL
                   AND ($2::UUID IS NULL OR department_id IS NULL OR department_id = $2)
                ) AS active_classes,
                (SELECT COUNT(*)::INTEGER FROM training_enrollments
                 WHERE company_id = $1 AND employee_id = $3 AND deleted_at IS NULL
                   AND status IN ('assigned', 'in_progress')
                ) AS my_pending_trainings,
                COALESCE((
                    SELECT ROUND(
                        100.0 * COUNT(*) FILTER (WHERE training_enrollments.status = 'completed')
                        / NULLIF(COUNT(*) FILTER (WHERE training_enrollments.status <> 'cancelled'), 0),
                        2
                    )
                    FROM training_enrollments
                    INNER JOIN training_classes ON training_classes.id = training_enrollments.class_id
                    WHERE training_enrollments.company_id = $1
                      AND training_enrollments.deleted_at IS NULL
                      AND training_classes.deleted_at IS NULL
                      AND ($2::UUID IS NULL OR training_classes.department_id IS NULL
                           OR training_classes.department_id = $2)
                ), 0)::TEXT AS completion_rate`,
            [context.companyId, departmentScope, context.employeeId],
        );
        const row = result.rows[0];
        return {
            publishedTrainings: row.published_trainings,
            activeClasses: row.active_classes,
            myPendingTrainings: row.my_pending_trainings,
            completionRate: Number(row.completion_rate),
        };
    }
}

export const trainingsRepository = new TrainingsRepository();


