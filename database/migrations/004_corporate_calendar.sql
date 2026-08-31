CREATE TYPE calendar_event_type AS ENUM (
    'meeting',
    'training',
    'interview',
    'deadline',
    'holiday',
    'birthday',
    'onboarding',
    'evaluation',
    'other'
);

CREATE TYPE calendar_event_visibility AS ENUM ('company', 'department', 'participants');
CREATE TYPE calendar_event_status AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE calendar_attendee_response AS ENUM ('pending', 'accepted', 'declined', 'tentative');

CREATE TABLE calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    description TEXT,
    event_type calendar_event_type NOT NULL DEFAULT 'meeting',
    visibility calendar_event_visibility NOT NULL DEFAULT 'department',
    status calendar_event_status NOT NULL DEFAULT 'scheduled',
    location VARCHAR(255),
    meeting_url VARCHAR(1000),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    timezone VARCHAR(100) NOT NULL DEFAULT 'America/Cuiaba',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT calendar_events_valid_range CHECK (ends_at > starts_at),
    CONSTRAINT calendar_events_department_scope CHECK (
        visibility <> 'department' OR department_id IS NOT NULL
    )
);

CREATE INDEX calendar_events_company_range_index
    ON calendar_events (company_id, starts_at, ends_at)
    WHERE deleted_at IS NULL;

CREATE INDEX calendar_events_department_range_index
    ON calendar_events (company_id, department_id, starts_at)
    WHERE deleted_at IS NULL;

CREATE TABLE calendar_event_attendees (
    event_id UUID NOT NULL REFERENCES calendar_events(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    response calendar_attendee_response NOT NULL DEFAULT 'pending',
    responded_at TIMESTAMPTZ,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (event_id, employee_id)
);

CREATE INDEX calendar_event_attendees_employee_index
    ON calendar_event_attendees (employee_id, response, event_id);

CREATE TRIGGER calendar_events_set_updated_at
    BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO permissions (code, module, action, description) VALUES
    ('calendar.read', 'calendar', 'read', 'Consultar eventos corporativos'),
    ('calendar.respond', 'calendar', 'respond', 'Responder convites do calendário')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code IN ('calendar.read', 'calendar.respond')
WHERE LOWER(roles.code) IN ('administrator', 'supervisor', 'collaborator')
ON CONFLICT DO NOTHING;
