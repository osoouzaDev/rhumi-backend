DROP INDEX employees_code_per_company_unique;
DROP INDEX employees_email_per_company_unique;

CREATE UNIQUE INDEX employees_code_unique
    ON employees (LOWER(employee_code))
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX employees_email_unique
    ON employees (LOWER(email))
    WHERE deleted_at IS NULL;
