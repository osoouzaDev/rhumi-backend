CREATE TYPE file_scan_status AS ENUM ('not_scanned', 'clean', 'infected', 'error');
CREATE TYPE privacy_request_type AS ENUM ('export', 'anonymization', 'deletion');
CREATE TYPE privacy_request_status AS ENUM ('pending', 'processing', 'completed', 'rejected');

CREATE TABLE stored_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    owner_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    purpose VARCHAR(80) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL,
    byte_size BIGINT NOT NULL,
    sha256 CHAR(64) NOT NULL,
    storage_key VARCHAR(255) NOT NULL UNIQUE,
    scan_status file_scan_status NOT NULL,
    scan_detail VARCHAR(255),
    retention_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT stored_files_byte_size_positive CHECK (byte_size > 0)
);

CREATE INDEX stored_files_owner_index
    ON stored_files (company_id, owner_employee_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX stored_files_retention_index
    ON stored_files (retention_until)
    WHERE deleted_at IS NULL AND retention_until IS NOT NULL;

CREATE TABLE file_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES stored_files(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    max_downloads INTEGER NOT NULL DEFAULT 1,
    download_count INTEGER NOT NULL DEFAULT 0,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT file_access_tokens_max_downloads_positive CHECK (max_downloads > 0),
    CONSTRAINT file_access_tokens_download_count_non_negative CHECK (download_count >= 0)
);

CREATE INDEX file_access_tokens_active_index
    ON file_access_tokens (file_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE privacy_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    purpose VARCHAR(120) NOT NULL,
    policy_version VARCHAR(80) NOT NULL,
    legal_basis VARCHAR(80) NOT NULL,
    granted BOOLEAN NOT NULL,
    recorded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX privacy_consents_employee_index
    ON privacy_consents (company_id, employee_id, purpose, created_at DESC);

CREATE TABLE privacy_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    requested_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    request_type privacy_request_type NOT NULL,
    status privacy_request_status NOT NULL DEFAULT 'pending',
    reason TEXT,
    result_file_id UUID REFERENCES stored_files(id) ON DELETE SET NULL,
    processed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    processing_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX privacy_requests_company_status_index
    ON privacy_requests (company_id, status, created_at DESC);

CREATE FUNCTION rhumi_resolve_file_token_company(file_token_hash TEXT)
RETURNS UUID
LANGUAGE SQL
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    UPDATE public.file_access_tokens AS access_token
    SET download_count = download_count + 1
    FROM public.stored_files AS stored_file
    WHERE access_token.token_hash::TEXT = file_token_hash
      AND stored_file.id = access_token.file_id
      AND stored_file.deleted_at IS NULL
      AND stored_file.scan_status IN ('clean', 'not_scanned')
      AND access_token.revoked_at IS NULL
      AND access_token.expires_at > NOW()
      AND access_token.download_count < access_token.max_downloads
    RETURNING access_token.company_id
$$;

REVOKE ALL ON FUNCTION rhumi_resolve_file_token_company(TEXT) FROM PUBLIC;

ALTER TABLE stored_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON stored_files
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

ALTER TABLE file_access_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON file_access_tokens
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

ALTER TABLE privacy_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON privacy_consents
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

ALTER TABLE privacy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON privacy_requests
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

INSERT INTO permissions (code, module, action, description) VALUES
    ('files.upload', 'files', 'upload', 'Enviar arquivos privados'),
    ('files.self.read', 'files', 'self_read', 'Consultar os próprios arquivos privados'),
    ('files.read', 'files', 'read', 'Consultar arquivos privados da empresa'),
    ('files.manage', 'files', 'manage', 'Gerenciar arquivos privados e sua retenção'),
    ('privacy.self', 'privacy', 'self', 'Exercer os próprios direitos de privacidade'),
    ('privacy.read', 'privacy', 'read', 'Consultar solicitações de privacidade'),
    ('privacy.manage', 'privacy', 'manage', 'Processar solicitações de privacidade')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.code = 'administrator'
  AND roles.company_id IS NULL
  AND permissions.code IN (
      'files.upload', 'files.self.read', 'files.read', 'files.manage',
      'privacy.self', 'privacy.read', 'privacy.manage'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT roles.id, permissions.id
FROM roles
CROSS JOIN permissions
WHERE roles.code IN ('supervisor', 'collaborator')
  AND roles.company_id IS NULL
  AND permissions.code IN ('files.upload', 'files.self.read', 'privacy.self')
ON CONFLICT DO NOTHING;
