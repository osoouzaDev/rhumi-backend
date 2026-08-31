CREATE TYPE vacancy_status AS ENUM ('draft', 'open', 'paused', 'closed', 'cancelled');
CREATE TYPE work_model AS ENUM ('onsite', 'hybrid', 'remote');
CREATE TYPE recruitment_application_stage AS ENUM (
    'applied',
    'screening',
    'interview',
    'assessment',
    'offer',
    'hired',
    'rejected'
);
CREATE TYPE recruitment_application_status AS ENUM ('active', 'withdrawn');

CREATE TABLE vacancies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
    title VARCHAR(180) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    description TEXT NOT NULL,
    responsibilities TEXT,
    requirements TEXT,
    location VARCHAR(180),
    contract_type contract_type NOT NULL,
    work_model work_model NOT NULL,
    status vacancy_status NOT NULL DEFAULT 'draft',
    openings INTEGER NOT NULL DEFAULT 1,
    salary_min NUMERIC(14, 2),
    salary_max NUMERIC(14, 2),
    published_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT vacancies_openings_positive CHECK (openings > 0),
    CONSTRAINT vacancies_salary_non_negative CHECK (
        (salary_min IS NULL OR salary_min >= 0)
        AND (salary_max IS NULL OR salary_max >= 0)
    ),
    CONSTRAINT vacancies_salary_range CHECK (
        salary_min IS NULL OR salary_max IS NULL OR salary_max >= salary_min
    ),
    CONSTRAINT vacancies_closes_after_published CHECK (
        published_at IS NULL OR closes_at IS NULL OR closes_at >= published_at
    )
);

CREATE UNIQUE INDEX vacancies_slug_per_company_unique
    ON vacancies (company_id, LOWER(slug))
    WHERE deleted_at IS NULL;

CREATE INDEX vacancies_company_status_index
    ON vacancies (company_id, status, created_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX vacancies_department_index
    ON vacancies (company_id, department_id)
    WHERE deleted_at IS NULL;

CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    full_name VARCHAR(180) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    headline VARCHAR(180),
    city VARCHAR(120),
    state VARCHAR(80),
    linkedin_url VARCHAR(500),
    resume_url VARCHAR(1000),
    source VARCHAR(80),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX candidates_email_per_company_unique
    ON candidates (company_id, LOWER(email))
    WHERE deleted_at IS NULL;

CREATE INDEX candidates_company_name_index
    ON candidates (company_id, LOWER(full_name))
    WHERE deleted_at IS NULL;

CREATE TABLE job_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    vacancy_id UUID NOT NULL REFERENCES vacancies(id) ON DELETE RESTRICT,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE RESTRICT,
    stage recruitment_application_stage NOT NULL DEFAULT 'applied',
    status recruitment_application_status NOT NULL DEFAULT 'active',
    score NUMERIC(5, 2),
    recruiter_notes TEXT,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hired_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT job_applications_score_range CHECK (
        score IS NULL OR (score >= 0 AND score <= 100)
    )
);

CREATE UNIQUE INDEX job_applications_candidate_vacancy_unique
    ON job_applications (vacancy_id, candidate_id)
    WHERE deleted_at IS NULL;

CREATE INDEX job_applications_vacancy_stage_index
    ON job_applications (company_id, vacancy_id, stage, stage_changed_at DESC)
    WHERE deleted_at IS NULL AND status = 'active';

CREATE INDEX job_applications_candidate_index
    ON job_applications (company_id, candidate_id, applied_at DESC)
    WHERE deleted_at IS NULL;

CREATE TABLE application_stage_history (
    id BIGSERIAL PRIMARY KEY,
    application_id UUID NOT NULL REFERENCES job_applications(id) ON DELETE CASCADE,
    from_stage recruitment_application_stage,
    to_stage recruitment_application_stage NOT NULL,
    changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX application_stage_history_application_index
    ON application_stage_history (application_id, changed_at DESC);

CREATE TRIGGER vacancies_set_updated_at
    BEFORE UPDATE ON vacancies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER candidates_set_updated_at
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER job_applications_set_updated_at
    BEFORE UPDATE ON job_applications
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
