CREATE TYPE evaluation_cycle_status AS ENUM (
    'draft', 'scheduled', 'active', 'completed', 'cancelled'
);
CREATE TYPE evaluation_competency_category AS ENUM (
    'behavioral', 'technical', 'leadership', 'cultural'
);
CREATE TYPE evaluation_assignment_status AS ENUM (
    'pending', 'self_review', 'manager_review', 'feedback_pending', 'completed', 'cancelled'
);
CREATE TYPE evaluation_reviewer_type AS ENUM ('self', 'manager');
CREATE TYPE performance_goal_status AS ENUM (
    'not_started', 'in_progress', 'completed', 'cancelled'
);

CREATE TABLE evaluation_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    code VARCHAR(60) NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    status evaluation_cycle_status NOT NULL DEFAULT 'draft',
    starts_on DATE NOT NULL,
    self_review_deadline DATE NOT NULL,
    manager_review_deadline DATE NOT NULL,
    feedback_deadline DATE NOT NULL,
    self_weight NUMERIC(5, 2) NOT NULL DEFAULT 30,
    manager_weight NUMERIC(5, 2) NOT NULL DEFAULT 70,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT evaluation_cycles_valid_dates CHECK (
        starts_on <= self_review_deadline
        AND self_review_deadline <= manager_review_deadline
        AND manager_review_deadline <= feedback_deadline
    ),
    CONSTRAINT evaluation_cycles_valid_weights CHECK (
        self_weight >= 0 AND manager_weight >= 0
        AND self_weight + manager_weight = 100
    )
);

CREATE UNIQUE INDEX evaluation_cycles_code_per_company_unique
    ON evaluation_cycles (company_id, LOWER(code))
    WHERE deleted_at IS NULL;

CREATE INDEX evaluation_cycles_company_status_index
    ON evaluation_cycles (company_id, status, starts_on DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE evaluation_competencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    category evaluation_competency_category NOT NULL,
    weight NUMERIC(5, 2) NOT NULL,
    position INTEGER NOT NULL,
    CONSTRAINT evaluation_competencies_weight_range CHECK (weight > 0 AND weight <= 100),
    CONSTRAINT evaluation_competencies_position_positive CHECK (position > 0),
    UNIQUE (cycle_id, position)
);

CREATE TABLE evaluation_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    cycle_id UUID NOT NULL REFERENCES evaluation_cycles(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    evaluator_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    status evaluation_assignment_status NOT NULL DEFAULT 'pending',
    self_score NUMERIC(5, 2),
    manager_score NUMERIC(5, 2),
    final_score NUMERIC(5, 2),
    employee_summary TEXT,
    strengths TEXT,
    improvement_points TEXT,
    development_actions TEXT,
    final_feedback TEXT,
    feedback_event_id UUID UNIQUE REFERENCES calendar_events(id) ON DELETE SET NULL,
    self_submitted_at TIMESTAMPTZ,
    manager_submitted_at TIMESTAMPTZ,
    feedback_completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cancelled_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT evaluation_assignments_score_ranges CHECK (
        (self_score IS NULL OR self_score BETWEEN 1 AND 5)
        AND (manager_score IS NULL OR manager_score BETWEEN 1 AND 5)
        AND (final_score IS NULL OR final_score BETWEEN 1 AND 5)
    )
);

CREATE UNIQUE INDEX evaluation_assignments_cycle_employee_unique
    ON evaluation_assignments (cycle_id, employee_id)
    WHERE deleted_at IS NULL;

CREATE INDEX evaluation_assignments_employee_status_index
    ON evaluation_assignments (company_id, employee_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX evaluation_assignments_evaluator_status_index
    ON evaluation_assignments (company_id, evaluator_employee_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE evaluation_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    assignment_id UUID NOT NULL REFERENCES evaluation_assignments(id) ON DELETE CASCADE,
    competency_id UUID NOT NULL REFERENCES evaluation_competencies(id) ON DELETE RESTRICT,
    reviewer_type evaluation_reviewer_type NOT NULL,
    score NUMERIC(3, 2) NOT NULL,
    comment TEXT,
    submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT evaluation_responses_score_range CHECK (score BETWEEN 1 AND 5),
    UNIQUE (assignment_id, competency_id, reviewer_type)
);

CREATE INDEX evaluation_responses_assignment_index
    ON evaluation_responses (company_id, assignment_id, reviewer_type);

CREATE TABLE performance_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    assignment_id UUID NOT NULL REFERENCES evaluation_assignments(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    success_criteria TEXT NOT NULL,
    weight NUMERIC(5, 2) NOT NULL,
    target_date DATE NOT NULL,
    status performance_goal_status NOT NULL DEFAULT 'not_started',
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    employee_notes TEXT,
    manager_notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT performance_goals_weight_range CHECK (weight > 0 AND weight <= 100),
    CONSTRAINT performance_goals_progress_range CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    )
);

CREATE INDEX performance_goals_assignment_index
    ON performance_goals (company_id, assignment_id, status, target_date)
    WHERE deleted_at IS NULL;

CREATE TRIGGER evaluation_cycles_set_updated_at
    BEFORE UPDATE ON evaluation_cycles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER evaluation_assignments_set_updated_at
    BEFORE UPDATE ON evaluation_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER evaluation_responses_set_updated_at
    BEFORE UPDATE ON evaluation_responses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER performance_goals_set_updated_at
    BEFORE UPDATE ON performance_goals
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'evaluations.self.respond'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor', 'collaborator')
ON CONFLICT DO NOTHING;


