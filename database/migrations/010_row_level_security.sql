CREATE FUNCTION rhumi_current_company_id()
RETURNS UUID
LANGUAGE SQL
STABLE
PARALLEL SAFE
SET search_path = pg_catalog, public
AS $$
    SELECT NULLIF(CURRENT_SETTING('rhumi.company_id', TRUE), '')::UUID
$$;

CREATE FUNCTION rhumi_resolve_login_company(identifier TEXT)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT employees.company_id
    FROM public.employees
    INNER JOIN public.users ON users.employee_id = employees.id
    INNER JOIN public.companies ON companies.id = employees.company_id
    WHERE users.deleted_at IS NULL
      AND employees.deleted_at IS NULL
      AND companies.deleted_at IS NULL
      AND (
          LOWER(employees.email) = LOWER(identifier)
          OR LOWER(employees.employee_code) = LOWER(identifier)
      )
    LIMIT 1
$$;

CREATE FUNCTION rhumi_resolve_refresh_company(token_hash TEXT)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT employees.company_id
    FROM public.sessions
    INNER JOIN public.users ON users.id = sessions.user_id
    INNER JOIN public.employees ON employees.id = users.employee_id
    WHERE sessions.refresh_token_hash::TEXT = token_hash
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION rhumi_resolve_login_company(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION rhumi_resolve_refresh_company(TEXT) FROM PUBLIC;

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'audit_logs',
        'calendar_events',
        'candidates',
        'career_tracks',
        'departments',
        'development_actions',
        'development_plans',
        'employee_career_profiles',
        'employees',
        'evaluation_assignments',
        'evaluation_cycles',
        'evaluation_responses',
        'job_applications',
        'journey_assignments',
        'journey_tasks',
        'journey_templates',
        'notification_announcements',
        'notification_preferences',
        'notifications',
        'performance_goals',
        'positions',
        'training_classes',
        'training_enrollments',
        'training_exam_attempts',
        'training_exams',
        'trainings',
        'vacancies'
    ]
    LOOP
        EXECUTE FORMAT('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE FORMAT(
            'CREATE POLICY tenant_isolation ON public.%I
             USING (company_id = rhumi_current_company_id())
             WITH CHECK (company_id = rhumi_current_company_id())',
            table_name
        );
    END LOOP;
END
$$;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON companies
    USING (id = rhumi_current_company_id())
    WITH CHECK (id = rhumi_current_company_id());

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY roles_visible_to_tenant ON roles
    FOR SELECT
    USING (company_id IS NULL OR company_id = rhumi_current_company_id());
CREATE POLICY roles_mutable_by_tenant ON roles
    FOR ALL
    USING (company_id = rhumi_current_company_id())
    WITH CHECK (company_id = rhumi_current_company_id());

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissions_read_only ON permissions
    FOR SELECT
    USING (TRUE);

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_read_only ON role_permissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM roles
            WHERE roles.id = role_permissions.role_id
              AND (
                  roles.company_id IS NULL
                  OR roles.company_id = rhumi_current_company_id()
              )
        )
    );

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON users
    USING (
        EXISTS (
            SELECT 1
            FROM employees
            WHERE employees.id = users.employee_id
              AND employees.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM employees
            WHERE employees.id = users.employee_id
              AND employees.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sessions
    USING (
        EXISTS (
            SELECT 1
            FROM users
            INNER JOIN employees ON employees.id = users.employee_id
            WHERE users.id = sessions.user_id
              AND employees.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM users
            INNER JOIN employees ON employees.id = users.employee_id
            WHERE users.id = sessions.user_id
              AND employees.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_roles
    USING (
        EXISTS (
            SELECT 1
            FROM users
            INNER JOIN employees ON employees.id = users.employee_id
            WHERE users.id = user_roles.user_id
              AND employees.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM users
            INNER JOIN employees ON employees.id = users.employee_id
            WHERE users.id = user_roles.user_id
              AND employees.company_id = rhumi_current_company_id()
        )
        AND EXISTS (
            SELECT 1
            FROM roles
            WHERE roles.id = user_roles.role_id
              AND (
                  roles.company_id IS NULL
                  OR roles.company_id = rhumi_current_company_id()
              )
        )
    );

ALTER TABLE user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON user_permission_overrides
    USING (
        EXISTS (
            SELECT 1
            FROM users
            INNER JOIN employees ON employees.id = users.employee_id
            WHERE users.id = user_permission_overrides.user_id
              AND employees.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM users
            INNER JOIN employees ON employees.id = users.employee_id
            WHERE users.id = user_permission_overrides.user_id
              AND employees.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE application_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON application_stage_history
    USING (
        EXISTS (
            SELECT 1 FROM job_applications
            WHERE job_applications.id = application_stage_history.application_id
              AND job_applications.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM job_applications
            WHERE job_applications.id = application_stage_history.application_id
              AND job_applications.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE calendar_event_attendees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON calendar_event_attendees
    USING (
        EXISTS (
            SELECT 1 FROM calendar_events
            WHERE calendar_events.id = calendar_event_attendees.event_id
              AND calendar_events.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM calendar_events
            WHERE calendar_events.id = calendar_event_attendees.event_id
              AND calendar_events.company_id = rhumi_current_company_id()
        )
        AND EXISTS (
            SELECT 1 FROM employees
            WHERE employees.id = calendar_event_attendees.employee_id
              AND employees.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE career_levels ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON career_levels
    USING (
        EXISTS (
            SELECT 1 FROM career_tracks
            WHERE career_tracks.id = career_levels.track_id
              AND career_tracks.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM career_tracks
            WHERE career_tracks.id = career_levels.track_id
              AND career_tracks.company_id = rhumi_current_company_id()
        )
        AND EXISTS (
            SELECT 1 FROM positions
            WHERE positions.id = career_levels.position_id
              AND positions.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE career_level_competencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON career_level_competencies
    USING (
        EXISTS (
            SELECT 1
            FROM career_levels
            INNER JOIN career_tracks ON career_tracks.id = career_levels.track_id
            WHERE career_levels.id = career_level_competencies.level_id
              AND career_tracks.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM career_levels
            INNER JOIN career_tracks ON career_tracks.id = career_levels.track_id
            WHERE career_levels.id = career_level_competencies.level_id
              AND career_tracks.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE career_level_trainings ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON career_level_trainings
    USING (
        EXISTS (
            SELECT 1
            FROM career_levels
            INNER JOIN career_tracks ON career_tracks.id = career_levels.track_id
            WHERE career_levels.id = career_level_trainings.level_id
              AND career_tracks.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM career_levels
            INNER JOIN career_tracks ON career_tracks.id = career_levels.track_id
            WHERE career_levels.id = career_level_trainings.level_id
              AND career_tracks.company_id = rhumi_current_company_id()
        )
        AND EXISTS (
            SELECT 1 FROM trainings
            WHERE trainings.id = career_level_trainings.training_id
              AND trainings.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE development_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON development_objectives
    USING (
        EXISTS (
            SELECT 1 FROM development_plans
            WHERE development_plans.id = development_objectives.plan_id
              AND development_plans.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM development_plans
            WHERE development_plans.id = development_objectives.plan_id
              AND development_plans.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE evaluation_competencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON evaluation_competencies
    USING (
        EXISTS (
            SELECT 1 FROM evaluation_cycles
            WHERE evaluation_cycles.id = evaluation_competencies.cycle_id
              AND evaluation_cycles.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM evaluation_cycles
            WHERE evaluation_cycles.id = evaluation_competencies.cycle_id
              AND evaluation_cycles.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE journey_template_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journey_template_stages
    USING (
        EXISTS (
            SELECT 1 FROM journey_templates
            WHERE journey_templates.id = journey_template_stages.template_id
              AND journey_templates.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM journey_templates
            WHERE journey_templates.id = journey_template_stages.template_id
              AND journey_templates.company_id = rhumi_current_company_id()
        )
    );

ALTER TABLE journey_template_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journey_template_tasks
    USING (
        EXISTS (
            SELECT 1
            FROM journey_template_stages
            INNER JOIN journey_templates
                ON journey_templates.id = journey_template_stages.template_id
            WHERE journey_template_stages.id = journey_template_tasks.stage_id
              AND journey_templates.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM journey_template_stages
            INNER JOIN journey_templates
                ON journey_templates.id = journey_template_stages.template_id
            WHERE journey_template_stages.id = journey_template_tasks.stage_id
              AND journey_templates.company_id = rhumi_current_company_id()
        )
        AND (
            journey_template_tasks.training_id IS NULL
            OR EXISTS (
                SELECT 1 FROM trainings
                WHERE trainings.id = journey_template_tasks.training_id
                  AND trainings.company_id = rhumi_current_company_id()
            )
        )
    );

ALTER TABLE training_exam_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON training_exam_questions
    USING (
        EXISTS (
            SELECT 1 FROM training_exams
            WHERE training_exams.id = training_exam_questions.exam_id
              AND training_exams.company_id = rhumi_current_company_id()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM training_exams
            WHERE training_exams.id = training_exam_questions.exam_id
              AND training_exams.company_id = rhumi_current_company_id()
        )
    );
