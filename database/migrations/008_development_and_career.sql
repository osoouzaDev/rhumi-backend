CREATE TYPE career_track_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE development_plan_status AS ENUM (
    'draft', 'active', 'completed', 'overdue', 'cancelled'
);
CREATE TYPE development_item_status AS ENUM (
    'not_started', 'in_progress', 'completed', 'blocked', 'cancelled'
);
CREATE TYPE development_action_type AS ENUM (
    'training', 'mentoring', 'project', 'course', 'reading', 'other'
);

CREATE TABLE career_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    code VARCHAR(60) NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    status career_track_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX career_tracks_code_per_company_unique
    ON career_tracks (company_id, LOWER(code)) WHERE deleted_at IS NULL;

CREATE INDEX career_tracks_company_status_index
    ON career_tracks (company_id, status, department_id) WHERE deleted_at IS NULL;

CREATE TABLE career_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id UUID NOT NULL REFERENCES career_tracks(id) ON DELETE CASCADE,
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    level_number INTEGER NOT NULL,
    minimum_months_experience INTEGER NOT NULL DEFAULT 0,
    requirements TEXT,
    CONSTRAINT career_levels_number_positive CHECK (level_number > 0),
    CONSTRAINT career_levels_experience_non_negative CHECK (minimum_months_experience >= 0),
    UNIQUE (track_id, level_number),
    UNIQUE (track_id, position_id)
);

CREATE TABLE career_level_competencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level_id UUID NOT NULL REFERENCES career_levels(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    category evaluation_competency_category NOT NULL,
    required_level NUMERIC(3, 2) NOT NULL,
    position INTEGER NOT NULL,
    CONSTRAINT career_level_competencies_level_range CHECK (required_level BETWEEN 1 AND 5),
    CONSTRAINT career_level_competencies_position_positive CHECK (position > 0),
    UNIQUE (level_id, position)
);

CREATE TABLE career_level_trainings (
    level_id UUID NOT NULL REFERENCES career_levels(id) ON DELETE CASCADE,
    training_id UUID NOT NULL REFERENCES trainings(id) ON DELETE RESTRICT,
    required BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (level_id, training_id)
);

CREATE TABLE employee_career_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    track_id UUID NOT NULL REFERENCES career_tracks(id) ON DELETE RESTRICT,
    current_level_id UUID REFERENCES career_levels(id) ON DELETE RESTRICT,
    target_level_id UUID REFERENCES career_levels(id) ON DELETE RESTRICT,
    readiness_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    manager_notes TEXT,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT employee_career_profiles_readiness_range CHECK (
        readiness_percent >= 0 AND readiness_percent <= 100
    ),
    UNIQUE (employee_id)
);

CREATE TABLE development_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    manager_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    evaluation_assignment_id UUID REFERENCES evaluation_assignments(id) ON DELETE SET NULL,
    target_career_level_id UUID REFERENCES career_levels(id) ON DELETE SET NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    focus_areas TEXT NOT NULL,
    status development_plan_status NOT NULL DEFAULT 'draft',
    starts_on DATE NOT NULL,
    target_end_on DATE NOT NULL,
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT development_plans_valid_range CHECK (target_end_on >= starts_on),
    CONSTRAINT development_plans_progress_range CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    )
);

CREATE UNIQUE INDEX development_plans_active_employee_unique
    ON development_plans (employee_id)
    WHERE deleted_at IS NULL AND status IN ('draft', 'active', 'overdue');

CREATE INDEX development_plans_company_status_index
    ON development_plans (company_id, status, target_end_on) WHERE deleted_at IS NULL;

CREATE TABLE development_objectives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES development_plans(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    success_criteria TEXT NOT NULL,
    weight NUMERIC(5, 2) NOT NULL,
    target_date DATE NOT NULL,
    status development_item_status NOT NULL DEFAULT 'not_started',
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    position INTEGER NOT NULL,
    CONSTRAINT development_objectives_weight_range CHECK (weight > 0 AND weight <= 100),
    CONSTRAINT development_objectives_progress_range CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    CONSTRAINT development_objectives_position_positive CHECK (position > 0),
    UNIQUE (plan_id, position)
);

CREATE TABLE development_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    objective_id UUID NOT NULL REFERENCES development_objectives(id) ON DELETE CASCADE,
    responsible_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    action_type development_action_type NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    status development_item_status NOT NULL DEFAULT 'not_started',
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    training_id UUID REFERENCES trainings(id) ON DELETE RESTRICT,
    training_enrollment_id UUID REFERENCES training_enrollments(id) ON DELETE SET NULL,
    calendar_event_id UUID UNIQUE REFERENCES calendar_events(id) ON DELETE SET NULL,
    meeting_ends_at TIMESTAMPTZ,
    resource_url VARCHAR(1000),
    employee_notes TEXT,
    manager_notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT development_actions_progress_range CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    ),
    CONSTRAINT development_actions_training_link CHECK (
        action_type <> 'training' OR training_id IS NOT NULL
    ),
    CONSTRAINT development_actions_mentoring_range CHECK (
        action_type <> 'mentoring'
        OR (meeting_ends_at IS NOT NULL AND meeting_ends_at > due_at)
    )
);

CREATE INDEX development_actions_objective_status_index
    ON development_actions (company_id, objective_id, status, due_at);

CREATE TRIGGER career_tracks_set_updated_at
    BEFORE UPDATE ON career_tracks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER employee_career_profiles_set_updated_at
    BEFORE UPDATE ON employee_career_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER development_plans_set_updated_at
    BEFORE UPDATE ON development_plans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER development_actions_set_updated_at
    BEFORE UPDATE ON development_actions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO permissions (code, module, action, description) VALUES
    ('development.manage', 'development', 'manage', 'Gerenciar PDIs e trilhas de carreira'),
    ('development.self.read', 'development', 'self_read', 'Acessar o próprio PDI e carreira')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'development.manage'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'development.self.read'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor', 'collaborator')
ON CONFLICT DO NOTHING;
