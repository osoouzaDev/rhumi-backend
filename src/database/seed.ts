import argon2 from "argon2";
import { z } from "zod";
import database, { closeMigrationDatabase } from "./migration-connection.js";

const seedSchema = z.object({
    SEED_COMPANY_LEGAL_NAME: z.string().trim().min(2),
    SEED_COMPANY_TAX_ID: z.string().trim().min(8),
    SEED_ADMIN_NAME: z.string().trim().min(2),
    SEED_ADMIN_EMAIL: z.string().trim().email(),
    SEED_ADMIN_PASSWORD: z.string().min(12),
    SEED_ADMIN_EMPLOYEE_CODE: z.string().trim().min(1).default("ADMIN001"),
});

interface IdRow {
    id: string;
}

const seed = async (): Promise<void> => {
    const configuration = seedSchema.parse(process.env);
    const passwordHash = await argon2.hash(configuration.SEED_ADMIN_PASSWORD, {
        type: argon2.argon2id,
    });
    const client = await database.connect();

    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["rhumi_initial_seed"]);

        const companyResult = await client.query<IdRow>(
            `INSERT INTO companies (legal_name, tax_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [configuration.SEED_COMPANY_LEGAL_NAME, configuration.SEED_COMPANY_TAX_ID],
        );
        const companyId = companyResult.rows[0]?.id ?? (
            await client.query<IdRow>(
                `SELECT id FROM companies
                 WHERE LOWER(tax_id) = LOWER($1) AND deleted_at IS NULL
                 LIMIT 1`,
                [configuration.SEED_COMPANY_TAX_ID],
            )
        ).rows[0]?.id;

        if (!companyId) {
            throw new Error("NÃ£o foi possÃ­vel localizar ou criar a empresa inicial.");
        }

        const departmentResult = await client.query<IdRow>(
            `INSERT INTO departments (company_id, name, acronym, icon)
             VALUES ($1, 'Recursos Humanos', 'RH', 'users')
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [companyId],
        );
        const departmentId = departmentResult.rows[0]?.id ?? (
            await client.query<IdRow>(
                `SELECT id FROM departments
                 WHERE company_id = $1
                   AND LOWER(name) = LOWER('Recursos Humanos')
                   AND deleted_at IS NULL
                 LIMIT 1`,
                [companyId],
            )
        ).rows[0]?.id;

        if (!departmentId) {
            throw new Error("NÃ£o foi possÃ­vel localizar ou criar o departamento inicial.");
        }

        const positionResult = await client.query<IdRow>(
            `INSERT INTO positions (company_id, department_id, title, description)
             VALUES ($1, $2, 'Administrador de Recursos Humanos', 'AdministraÃ§Ã£o da plataforma RHumi')
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [companyId, departmentId],
        );
        const positionId = positionResult.rows[0]?.id ?? (
            await client.query<IdRow>(
                `SELECT id FROM positions
                 WHERE company_id = $1
                   AND department_id = $2
                   AND LOWER(title) = LOWER('Administrador de Recursos Humanos')
                   AND deleted_at IS NULL
                 LIMIT 1`,
                [companyId, departmentId],
            )
        ).rows[0]?.id;

        if (!positionId) {
            throw new Error("NÃ£o foi possÃ­vel localizar ou criar o cargo inicial.");
        }

        const employeeResult = await client.query<IdRow>(
            `INSERT INTO employees (
                company_id,
                department_id,
                position_id,
                employee_code,
                full_name,
                email,
                contract_type,
                admission_date
             ) VALUES ($1, $2, $3, $4, $5, $6, 'clt', CURRENT_DATE)
             ON CONFLICT DO NOTHING
             RETURNING id`,
            [
                companyId,
                departmentId,
                positionId,
                configuration.SEED_ADMIN_EMPLOYEE_CODE,
                configuration.SEED_ADMIN_NAME,
                configuration.SEED_ADMIN_EMAIL,
            ],
        );
        const employeeId = employeeResult.rows[0]?.id ?? (
            await client.query<IdRow>(
                `SELECT id FROM employees
                 WHERE company_id = $1
                   AND LOWER(employee_code) = LOWER($2)
                   AND deleted_at IS NULL
                 LIMIT 1`,
                [companyId, configuration.SEED_ADMIN_EMPLOYEE_CODE],
            )
        ).rows[0]?.id;

        if (!employeeId) {
            throw new Error("NÃ£o foi possÃ­vel localizar ou criar o colaborador administrador.");
        }

        const userResult = await client.query<IdRow>(
            `INSERT INTO users (employee_id, password_hash)
             VALUES ($1, $2)
             ON CONFLICT (employee_id) DO UPDATE
             SET password_hash = EXCLUDED.password_hash,
                 status = 'active',
                 failed_login_attempts = 0,
                 locked_until = NULL,
                 deleted_at = NULL
             RETURNING id`,
            [employeeId, passwordHash],
        );
        const userId = userResult.rows[0].id;

        await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             SELECT $1, roles.id
             FROM roles
             WHERE roles.code = 'administrator' AND roles.company_id IS NULL
             ON CONFLICT DO NOTHING`,
            [userId],
        );

        await client.query("COMMIT");
        console.log("Administrador inicial configurado com sucesso.");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

void seed()
    .then(async () => {
        await closeMigrationDatabase();
    })
    .catch(async (error) => {
        console.error("Falha ao configurar os dados iniciais:", error);
        await closeMigrationDatabase();
        process.exit(1);
    });
