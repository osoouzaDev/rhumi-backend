CREATE TABLE user_mfa_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    secret_encrypted TEXT,
    pending_secret_encrypted TEXT,
    recovery_code_hashes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_mfa_enabled_secret_required CHECK (
        NOT enabled OR secret_encrypted IS NOT NULL
    )
);

CREATE TABLE mfa_login_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT mfa_login_challenges_attempts_non_negative CHECK (attempts >= 0)
);

CREATE INDEX mfa_login_challenges_active_index
    ON mfa_login_challenges (user_id, expires_at)
    WHERE used_at IS NULL;

CREATE TRIGGER user_mfa_settings_set_updated_at
    BEFORE UPDATE ON user_mfa_settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE FUNCTION rhumi_resolve_mfa_challenge_company(challenge_hash TEXT)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT company_id
    FROM public.mfa_login_challenges
    WHERE token_hash::TEXT = challenge_hash
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION rhumi_resolve_mfa_challenge_company(TEXT) FROM PUBLIC;

ALTER TABLE user_mfa_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_mfa_settings
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

ALTER TABLE mfa_login_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mfa_login_challenges
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());
