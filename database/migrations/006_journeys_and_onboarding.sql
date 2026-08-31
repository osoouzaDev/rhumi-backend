CREATE TYPE journey_kind AS ENUM ('onboarding', 'offboarding', 'development', 'custom');
CREATE TYPE journey_template_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE journey_assignment_status AS ENUM (
    'planned', 'in_progress', 'completed', 'overdue', 'cancelled'
);
CREATE TYPE journey_task_type AS ENUM ('manual', 'training', 'meeting', 'document');
CREATE TYPE journey_task_responsible AS ENUM ('collaborator', 'owner');
CREATE TYPE journey_task_status AS ENUM (
    'pending', 'in_progress', 'completed', 'skipped', 'blocked'
);

CREATE TABLE journey_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    code VARCHAR(60) NOT NULL,
    name VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    kind journey_kind NOT NULL,
    duration_days INTEGER NOT NULL,
    status journey_template_status NOT NULL DEFAULT 'draft',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT journey_templates_duration_positive CHECK (duration_days > 0)
);

CREATE UNIQUE INDEX journey_templates_code_per_company_unique
    ON journey_templates (company_id, LOWER(code))
    WHERE deleted_at IS NULL;

CREATE INDEX journey_templates_company_status_index
    ON journey_templates (company_id, status, kind, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE journey_template_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES journey_templates(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL,
    starts_after_days INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT journey_template_stages_position_positive CHECK (position > 0),
    CONSTRAINT journey_template_stages_offset_non_negative CHECK (starts_after_days >= 0),
    UNIQUE (template_id, position)
);

CREATE TABLE journey_template_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id UUID NOT NULL REFERENCES journey_template_stages(id) ON DELETE CASCADE,
    title VARCHAR(180) NOT NULL,
    description TEXT,
    task_type journey_task_type NOT NULL DEFAULT 'manual',
    responsible journey_task_responsible NOT NULL DEFAULT 'collaborator',
    required BOOLEAN NOT NULL DEFAULT TRUE,
    position INTEGER NOT NULL,
    due_after_days INTEGER NOT NULL,
    training_id UUID REFERENCES trainings(id) ON DELETE RESTRICT,
    meeting_time TIME,
    meeting_duration_minutes INTEGER,
    resource_url VARCHAR(1000),
    CONSTRAINT journey_template_tasks_position_positive CHECK (position > 0),
    CONSTRAINT journey_template_tasks_due_non_negative CHECK (due_after_days >= 0),
    CONSTRAINT journey_template_tasks_meeting_duration_positive CHECK (
        meeting_duration_minutes IS NULL OR meeting_duration_minutes > 0
    ),
    CONSTRAINT journey_template_tasks_training_link CHECK (
        task_type <> 'training' OR training_id IS NOT NULL
    ),
    CONSTRAINT journey_template_tasks_meeting_fields CHECK (
        task_type <> 'meeting'
        OR (meeting_time IS NOT NULL AND meeting_duration_minutes IS NOT NULL)
    ),
    UNIQUE (stage_id, position)
);

CREATE TABLE journey_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    template_id UUID NOT NULL REFERENCES journey_templates(id) ON DELETE RESTRICT,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    owner_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    status journey_assignment_status NOT NULL DEFAULT 'planned',
    starts_on DATE NOT NULL,
    target_end_on DATE NOT NULL,
    progress_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT journey_assignments_valid_range CHECK (target_end_on >= starts_on),
    CONSTRAINT journey_assignments_progress_range CHECK (
        progress_percent >= 0 AND progress_percent <= 100
    )
);

CREATE UNIQUE INDEX journey_assignments_active_template_employee_unique
    ON journey_assignments (template_id, employee_id)
    WHERE deleted_at IS NULL
      AND status IN ('planned', 'in_progress', 'overdue');

CREATE INDEX journey_assignments_company_status_index
    ON journey_assignments (company_id, status, target_end_on)
    WHERE deleted_at IS NULL;

CREATE INDEX journey_assignments_employee_index
    ON journey_assignments (company_id, employee_id, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE journey_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    assignment_id UUID NOT NULL REFERENCES journey_assignments(id) ON DELETE CASCADE,
    template_task_id UUID NOT NULL REFERENCES journey_template_tasks(id) ON DELETE RESTRICT,
    responsible_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    status journey_task_status NOT NULL DEFAULT 'pending',
    due_at TIMESTAMPTZ NOT NULL,
    training_enrollment_id UUID REFERENCES training_enrollments(id) ON DELETE SET NULL,
    calendar_event_id UUID UNIQUE REFERENCES calendar_events(id) ON DELETE SET NULL,
    evidence_url VARCHAR(1000),
    notes TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (assignment_id, template_task_id)
);

CREATE INDEX journey_tasks_assignment_status_index
    ON journey_tasks (company_id, assignment_id, status, due_at);

CREATE INDEX journey_tasks_responsible_index
    ON journey_tasks (company_id, responsible_employee_id, status, due_at);

CREATE TRIGGER journey_templates_set_updated_at
    BEFORE UPDATE ON journey_templates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER journey_assignments_set_updated_at
    BEFORE UPDATE ON journey_assignments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER journey_tasks_set_updated_at
    BEFORE UPDATE ON journey_tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'journeys.self.read'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor', 'collaborator')
ON CONFLICT DO NOTHING;
