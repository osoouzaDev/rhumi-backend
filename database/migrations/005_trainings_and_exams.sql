CREATE TYPE training_modality AS ENUM ('online', 'in_person', 'hybrid');
CREATE TYPE training_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE training_class_status AS ENUM ('draft', 'open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE training_enrollment_status AS ENUM (
    'assigned', 'in_progress', 'completed', 'failed', 'cancelled'
);
CREATE TYPE training_question_type AS ENUM ('single_choice', 'multiple_choice', 'true_false');

CREATE TABLE trainings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    code VARCHAR(60) NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    objectives TEXT,
    instructor VARCHAR(180),
    modality training_modality NOT NULL,
    workload_minutes INTEGER NOT NULL,
    cover_url VARCHAR(1000),
    materials JSONB NOT NULL DEFAULT '[]'::JSONB,
    status training_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT trainings_workload_positive CHECK (workload_minutes > 0),
    CONSTRAINT trainings_materials_array CHECK (JSONB_TYPEOF(materials) = 'array')
);

CREATE UNIQUE INDEX trainings_code_per_company_unique
    ON trainings (company_id, LOWER(code))
    WHERE deleted_at IS NULL;

CREATE INDEX trainings_company_status_index
    ON trainings (company_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX trainings_department_index
    ON trainings (company_id, department_id)
    WHERE deleted_at IS NULL;

CREATE TABLE training_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    name VARCHAR(180) NOT NULL,
    status training_class_status NOT NULL DEFAULT 'draft',
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    enrollment_deadline TIMESTAMPTZ,
    capacity INTEGER,
    location VARCHAR(255),
    meeting_url VARCHAR(1000),
    calendar_event_id UUID UNIQUE REFERENCES calendar_events(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT training_classes_valid_range CHECK (ends_at > starts_at),
    CONSTRAINT training_classes_deadline_before_start CHECK (
        enrollment_deadline IS NULL OR enrollment_deadline <= starts_at
    ),
    CONSTRAINT training_classes_capacity_positive CHECK (capacity IS NULL OR capacity > 0)
);

CREATE INDEX training_classes_training_status_index
    ON training_classes (company_id, training_id, status, starts_at)
    WHERE deleted_at IS NULL;

CREATE TABLE training_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    class_id UUID NOT NULL REFERENCES training_classes(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    status training_enrollment_status NOT NULL DEFAULT 'assigned',
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    best_score NUMERIC(5, 2),
    enrolled_by UUID REFERENCES users(id) ON DELETE SET NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT training_enrollments_progress_range CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    CONSTRAINT training_enrollments_score_range CHECK (
        best_score IS NULL OR (best_score >= 0 AND best_score <= 100)
    )
);

CREATE UNIQUE INDEX training_enrollments_class_employee_unique
    ON training_enrollments (class_id, employee_id)
    WHERE deleted_at IS NULL;

CREATE INDEX training_enrollments_employee_status_index
    ON training_enrollments (company_id, employee_id, status, enrolled_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE training_exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    instructions TEXT,
    passing_score NUMERIC(5, 2) NOT NULL DEFAULT 70,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    time_limit_minutes INTEGER,
    published BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT training_exams_passing_score_range CHECK (
        passing_score >= 0 AND passing_score <= 100
    ),
    CONSTRAINT training_exams_max_attempts_positive CHECK (max_attempts > 0),
    CONSTRAINT training_exams_time_limit_positive CHECK (
        time_limit_minutes IS NULL OR time_limit_minutes > 0
    )
);

CREATE UNIQUE INDEX training_exams_training_unique
    ON training_exams (training_id)
    WHERE deleted_at IS NULL;

CREATE TABLE training_exam_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID NOT NULL REFERENCES training_exams(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    question_type training_question_type NOT NULL,
    points NUMERIC(8, 2) NOT NULL DEFAULT 1,
    position INTEGER NOT NULL,
    options JSONB NOT NULL,
    CONSTRAINT training_exam_questions_points_positive CHECK (points > 0),
    CONSTRAINT training_exam_questions_position_positive CHECK (position > 0),
    CONSTRAINT training_exam_questions_options_array CHECK (JSONB_TYPEOF(options) = 'array'),
    UNIQUE (exam_id, position)
);

CREATE TABLE training_exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    exam_id UUID NOT NULL REFERENCES training_exams(id) ON DELETE RESTRICT,
    enrollment_id UUID NOT NULL REFERENCES training_enrollments(id) ON DELETE RESTRICT,
    attempt_number INTEGER NOT NULL,
    score NUMERIC(5, 2) NOT NULL,
    passed BOOLEAN NOT NULL,
    answers JSONB NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT training_exam_attempts_number_positive CHECK (attempt_number > 0),
    CONSTRAINT training_exam_attempts_score_range CHECK (score >= 0 AND score <= 100),
    CONSTRAINT training_exam_attempts_answers_array CHECK (JSONB_TYPEOF(answers) = 'array'),
    UNIQUE (exam_id, enrollment_id, attempt_number)
);

CREATE INDEX training_exam_attempts_enrollment_index
    ON training_exam_attempts (company_id, enrollment_id, attempt_number DESC);

CREATE TRIGGER trainings_set_updated_at
    BEFORE UPDATE ON trainings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER training_classes_set_updated_at
    BEFORE UPDATE ON training_classes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER training_enrollments_set_updated_at
    BEFORE UPDATE ON training_enrollments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER training_exams_set_updated_at
    BEFORE UPDATE ON training_exams
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'trainings.self.read'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor', 'collaborator')
ON CONFLICT DO NOTHING;
