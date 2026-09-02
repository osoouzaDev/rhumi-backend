ALTER TABLE notifications
    ADD COLUMN email_queued_at TIMESTAMPTZ,
    ADD COLUMN last_reminded_at TIMESTAMPTZ;

CREATE TABLE notification_digest_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    frequency notification_digest_frequency NOT NULL,
    period_key VARCHAR(20) NOT NULL,
    queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, frequency, period_key)
);

CREATE INDEX notification_digest_deliveries_company_index
    ON notification_digest_deliveries (company_id, queued_at DESC);

ALTER TABLE notification_digest_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notification_digest_deliveries
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

CREATE FUNCTION rhumi_active_company_ids()
RETURNS TABLE (company_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT companies.id
    FROM public.companies
    WHERE companies.active = TRUE AND companies.deleted_at IS NULL
    ORDER BY companies.id
$$;

CREATE FUNCTION rhumi_due_email_company_ids(maximum_companies INTEGER)
RETURNS TABLE (company_id UUID)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT email_outbox.company_id
    FROM public.email_outbox
    WHERE (
        email_outbox.status = 'queued'
        AND email_outbox.available_at <= NOW()
    ) OR (
        email_outbox.status = 'processing'
        AND email_outbox.locked_at < NOW() - INTERVAL '15 minutes'
    )
    GROUP BY email_outbox.company_id
    ORDER BY MIN(email_outbox.available_at)
    LIMIT GREATEST(1, LEAST(maximum_companies, 1000))
$$;

REVOKE ALL ON FUNCTION rhumi_active_company_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION rhumi_due_email_company_ids(INTEGER) FROM PUBLIC;
