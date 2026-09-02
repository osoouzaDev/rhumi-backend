ALTER TABLE users
    ADD COLUMN activated_at TIMESTAMPTZ,
    ADD COLUMN email_verified_at TIMESTAMPTZ;

UPDATE users
SET activated_at = COALESCE(activated_at, created_at),
    email_verified_at = COALESCE(email_verified_at, created_at);

CREATE TYPE account_token_purpose AS ENUM (
    'activation',
    'password_reset',
    'email_verification'
);

CREATE TYPE email_delivery_status AS ENUM (
    'queued',
    'processing',
    'sent',
    'failed'
);

CREATE TABLE account_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose account_token_purpose NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    request_ip VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX account_tokens_active_index
    ON account_tokens (user_id, purpose, expires_at)
    WHERE consumed_at IS NULL;

CREATE TABLE email_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    recipient VARCHAR(255) NOT NULL,
    template VARCHAR(80) NOT NULL,
    subject VARCHAR(180) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    status email_delivery_status NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_outbox_attempts_non_negative CHECK (attempts >= 0),
    CONSTRAINT email_outbox_max_attempts_positive CHECK (max_attempts > 0)
);

CREATE INDEX email_outbox_pending_index
    ON email_outbox (available_at, created_at)
    WHERE status IN ('queued', 'processing');

CREATE TRIGGER email_outbox_set_updated_at
    BEFORE UPDATE ON email_outbox
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION rhumi_resolve_account_token_company(account_token_hash TEXT)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT company_id
    FROM public.account_tokens
    WHERE token_hash::TEXT = account_token_hash
      AND consumed_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION rhumi_resolve_account_token_company(TEXT) FROM PUBLIC;

ALTER TABLE account_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON account_tokens
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

ALTER TABLE email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON email_outbox
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

INSERT INTO permissions (code, module, action, description) VALUES
    ('audit.read', 'audit', 'read', 'Consultar registros de auditoria'),
    ('audit.export', 'audit', 'export', 'Exportar registros de auditoria'),
    ('reports.export', 'reports', 'export', 'Exportar relatórios administrativos')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.code = 'administrator'
  AND roles.company_id IS NULL
  AND permissions.code IN ('audit.read', 'audit.export', 'reports.export')
ON CONFLICT DO NOTHING;
