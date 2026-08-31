CREATE TYPE notification_type AS ENUM (
    'journey', 'training', 'calendar', 'evaluation', 'development',
    'recruitment', 'announcement', 'system'
);

CREATE TYPE notification_priority AS ENUM ('low', 'normal', 'high', 'urgent');
CREATE TYPE notification_digest_frequency AS ENUM ('immediate', 'daily', 'weekly', 'off');
CREATE TYPE notification_audience_type AS ENUM ('company', 'department', 'employees');

CREATE TABLE notification_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    digest_frequency notification_digest_frequency NOT NULL DEFAULT 'immediate',
    reminder_days INTEGER[] NOT NULL DEFAULT ARRAY[0, 1, 3, 7],
    notify_low_priority BOOLEAN NOT NULL DEFAULT TRUE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(100) NOT NULL DEFAULT 'America/Cuiaba',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT notification_preferences_reminder_days_valid CHECK (
        ARRAY_POSITION(reminder_days, NULL) IS NULL
        AND 0 <= ALL(reminder_days)
        AND 365 >= ALL(reminder_days)
    ),
    CONSTRAINT notification_preferences_quiet_hours_pair CHECK (
        (quiet_hours_start IS NULL) = (quiet_hours_end IS NULL)
    )
);

CREATE TABLE notification_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES departments(id) ON DELETE RESTRICT,
    audience_type notification_audience_type NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    priority notification_priority NOT NULL DEFAULT 'normal',
    action_url VARCHAR(1000),
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT notification_announcements_department_scope CHECK (
        audience_type <> 'department' OR department_id IS NOT NULL
    )
);

CREATE INDEX notification_announcements_company_created_index
    ON notification_announcements (company_id, created_at DESC)
    WHERE archived_at IS NULL;

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    priority notification_priority NOT NULL DEFAULT 'normal',
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    action_url VARCHAR(1000),
    source_type VARCHAR(100) NOT NULL,
    source_id UUID NOT NULL,
    due_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,
    automatic BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (recipient_user_id, source_type, source_id)
);

CREATE INDEX notifications_recipient_inbox_index
    ON notifications (recipient_user_id, resolved_at, read_at, created_at DESC)
    WHERE dismissed_at IS NULL;

CREATE INDEX notifications_company_type_index
    ON notifications (company_id, type, priority, due_at)
    WHERE dismissed_at IS NULL;

CREATE TRIGGER notification_preferences_set_updated_at
    BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER notifications_set_updated_at
    BEFORE UPDATE ON notifications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO permissions (code, module, action, description) VALUES
    ('notifications.read', 'notifications', 'read', 'Consultar e organizar as próprias notificações'),
    ('notifications.manage', 'notifications', 'manage', 'Publicar comunicados internos')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'notifications.read'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor', 'collaborator')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
JOIN permissions ON permissions.code = 'notifications.manage'
WHERE LOWER(roles.code) IN ('administrator', 'supervisor')
ON CONFLICT DO NOTHING;
