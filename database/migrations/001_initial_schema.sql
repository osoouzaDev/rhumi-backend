CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE contract_type AS ENUM ('clt', 'pj');
CREATE TYPE employee_status AS ENUM ('active', 'on_leave', 'inactive');
CREATE TYPE user_status AS ENUM ('active', 'blocked', 'inactive');
CREATE TYPE permission_effect AS ENUM ('allow', 'deny');

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name VARCHAR(180) NOT NULL,
    trade_name VARCHAR(180),
    tax_id VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(30),
    address_line VARCHAR(255),
    city VARCHAR(120),
    state VARCHAR(80),
    postal_code VARCHAR(20),
    founded_on DATE,
    description TEXT,
    careers_headline VARCHAR(180),
    careers_description TEXT,
    careers_slug VARCHAR(120),
    mission TEXT,
    vision TEXT,
    values_text TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX companies_tax_id_unique
    ON companies (LOWER(tax_id))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX companies_careers_slug_unique
    ON companies (LOWER(careers_slug))
    WHERE careers_slug IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    name VARCHAR(120) NOT NULL,
    acronym VARCHAR(20),
    icon VARCHAR(80),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX departments_name_per_company_unique
    ON departments (company_id, LOWER(name))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX departments_acronym_per_company_unique
    ON departments (company_id, LOWER(acronym))
    WHERE acronym IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    title VARCHAR(140) NOT NULL,
    description TEXT,
    base_salary NUMERIC(14, 2),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT positions_base_salary_non_negative
        CHECK (base_salary IS NULL OR base_salary >= 0)
);

CREATE UNIQUE INDEX positions_title_per_department_unique
    ON positions (company_id, department_id, LOWER(title))
    WHERE deleted_at IS NULL;

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE RESTRICT,
    employee_code VARCHAR(50) NOT NULL,
    full_name VARCHAR(180) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30),
    contract_type contract_type NOT NULL,
    status employee_status NOT NULL DEFAULT 'active',
    admission_date DATE NOT NULL,
    termination_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT employees_termination_after_admission
        CHECK (termination_date IS NULL OR termination_date >= admission_date)
);

CREATE UNIQUE INDEX employees_code_per_company_unique
    ON employees (company_id, LOWER(employee_code))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX employees_email_per_company_unique
    ON employees (company_id, LOWER(email))
    WHERE deleted_at IS NULL;

CREATE INDEX employees_department_index
    ON employees (company_id, department_id)
    WHERE deleted_at IS NULL;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL UNIQUE REFERENCES employees(id) ON DELETE RESTRICT,
    password_hash TEXT NOT NULL,
    status user_status NOT NULL DEFAULT 'active',
    failed_login_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT users_failed_login_attempts_non_negative
        CHECK (failed_login_attempts >= 0)
);

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(80) NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX system_roles_code_unique
    ON roles (LOWER(code))
    WHERE company_id IS NULL;

CREATE UNIQUE INDEX company_roles_code_unique
    ON roles (company_id, LOWER(code))
    WHERE company_id IS NOT NULL;

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(120) NOT NULL UNIQUE,
    module VARCHAR(60) NOT NULL,
    action VARCHAR(60) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_permission_overrides (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    effect permission_effect NOT NULL,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, permission_id)
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revocation_reason VARCHAR(80),
    replaced_by_session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX active_sessions_by_user_index
    ON sessions (user_id, expires_at)
    WHERE revoked_at IS NULL;

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event VARCHAR(120) NOT NULL,
    entity_type VARCHAR(80),
    entity_id UUID,
    request_id UUID,
    context JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_company_created_at_index
    ON audit_logs (company_id, created_at DESC);

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_set_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER departments_set_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER positions_set_updated_at
    BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER employees_set_updated_at
    BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO permissions (code, module, action, description) VALUES
    ('dashboard.read', 'dashboard', 'read', 'Consultar indicadores do dashboard'),
    ('companies.read', 'companies', 'read', 'Consultar dados da empresa'),
    ('companies.update', 'companies', 'update', 'Atualizar dados da empresa'),
    ('departments.list', 'departments', 'list', 'Listar departamentos'),
    ('departments.create', 'departments', 'create', 'Cadastrar departamentos'),
    ('departments.update', 'departments', 'update', 'Atualizar departamentos'),
    ('departments.delete', 'departments', 'delete', 'Desativar departamentos'),
    ('positions.list', 'positions', 'list', 'Listar cargos'),
    ('positions.create', 'positions', 'create', 'Cadastrar cargos'),
    ('positions.update', 'positions', 'update', 'Atualizar cargos'),
    ('positions.delete', 'positions', 'delete', 'Desativar cargos'),
    ('employees.list', 'employees', 'list', 'Listar colaboradores'),
    ('employees.read', 'employees', 'read', 'Consultar colaboradores'),
    ('employees.create', 'employees', 'create', 'Cadastrar colaboradores'),
    ('employees.update', 'employees', 'update', 'Atualizar colaboradores'),
    ('employees.delete', 'employees', 'delete', 'Desativar colaboradores'),
    ('employees.self.read', 'employees', 'self_read', 'Consultar o próprio perfil'),
    ('users.list', 'users', 'list', 'Listar contas de acesso'),
    ('users.create', 'users', 'create', 'Cadastrar contas de acesso'),
    ('users.update', 'users', 'update', 'Atualizar contas de acesso'),
    ('users.delete', 'users', 'delete', 'Desativar contas de acesso'),
    ('calendar.manage', 'calendar', 'manage', 'Gerenciar eventos corporativos'),
    ('recruitment.manage', 'recruitment', 'manage', 'Gerenciar vagas e candidatos'),
    ('trainings.manage', 'trainings', 'manage', 'Gerenciar treinamentos e provas'),
    ('trainings.self.read', 'trainings', 'self_read', 'Acessar os próprios treinamentos'),
    ('journeys.manage', 'journeys', 'manage', 'Gerenciar jornadas de colaboradores'),
    ('journeys.self.read', 'journeys', 'self_read', 'Acessar a própria jornada'),
    ('evaluations.manage', 'evaluations', 'manage', 'Gerenciar ciclos de avaliação'),
    ('evaluations.self.respond', 'evaluations', 'self_respond', 'Responder avaliações atribuídas');

INSERT INTO roles (code, name, description, is_system) VALUES
    ('administrator', 'Administrador de RH', 'Acesso administrativo completo à plataforma', TRUE),
    ('supervisor', 'Supervisor', 'Gestão dos colaboradores e processos do próprio setor', TRUE),
    ('collaborator', 'Colaborador', 'Acesso ao portal e aos próprios dados', TRUE);

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
CROSS JOIN permissions AS permission
WHERE role.code = 'administrator';

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code IN (
    'dashboard.read',
    'companies.read',
    'departments.list',
    'positions.list',
    'employees.list',
    'employees.read',
    'employees.update',
    'calendar.manage',
    'trainings.manage',
    'journeys.manage',
    'evaluations.manage',
    'evaluations.self.respond'
)
WHERE role.code = 'supervisor';

INSERT INTO role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM roles AS role
JOIN permissions AS permission ON permission.code IN (
    'employees.self.read',
    'trainings.self.read',
    'journeys.self.read',
    'evaluations.self.respond'
)
WHERE role.code = 'collaborator';
