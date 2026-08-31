import { env } from "../config/env.js";
import migrationDatabase, { closeMigrationDatabase } from "./migration-connection.js";

const roleNamePattern = /^[a-z_][a-z0-9_]{0,62}$/;
const quoteIdentifier = (identifier: string): string => (
    `"${identifier.replaceAll('"', '""')}"`
);

const runtimeCredentials = (): { roleName: string; password: string } => {
    if (env.DB_USER && env.DB_PASSWORD) {
        return { roleName: env.DB_USER, password: env.DB_PASSWORD };
    }
    if (env.DATABASE_URL) {
        const url = new URL(env.DATABASE_URL);
        return {
            roleName: decodeURIComponent(url.username),
            password: decodeURIComponent(url.password),
        };
    }
    throw new Error("As credenciais do usuário da aplicação não foram configuradas.");
};

const provisionApplicationRole = async (): Promise<void> => {
    const { roleName, password } = runtimeCredentials();
    if (!roleNamePattern.test(roleName)) {
        throw new Error("DB_USER deve ser um identificador PostgreSQL simples e seguro.");
    }
    if (password.length < 32) {
        throw new Error(
            "A senha do usuário PostgreSQL da aplicação deve ter ao menos 32 caracteres.",
        );
    }
    if (roleName === env.DB_MIGRATION_USER) {
        throw new Error(
            "O usuário da aplicação precisa ser diferente do usuário de migrations.",
        );
    }

    const client = await migrationDatabase.connect();
    try {
        await client.query("BEGIN");
        const role = await client.query<{ exists: boolean }>(
            "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1) AS exists",
            [roleName],
        );
        const statement = await client.query<{ sql: string }>(
            `SELECT FORMAT(
                CASE WHEN $3::BOOLEAN
                    THEN 'ALTER ROLE %I WITH LOGIN PASSWORD %L'
                    ELSE 'CREATE ROLE %I WITH LOGIN PASSWORD %L'
                END,
                $1::TEXT, $2::TEXT
             ) AS sql`,
            [roleName, password, role.rows[0].exists],
        );
        await client.query(statement.rows[0].sql);

        const quotedRole = quoteIdentifier(roleName);
        await client.query(`ALTER ROLE ${quotedRole} SET row_security = on`);
        const databaseName = await client.query<{ name: string }>(
            "SELECT CURRENT_DATABASE() AS name",
        );
        const attributes = await client.query<{
            rolsuper: boolean;
            rolcreatedb: boolean;
            rolcreaterole: boolean;
            rolreplication: boolean;
            rolbypassrls: boolean;
        }>(
            `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
             FROM pg_roles WHERE rolname = $1`,
            [roleName],
        );
        const unsafeRole = attributes.rows[0];
        if (
            unsafeRole.rolsuper
            || unsafeRole.rolcreatedb
            || unsafeRole.rolcreaterole
            || unsafeRole.rolreplication
            || unsafeRole.rolbypassrls
        ) {
            throw new Error(
                "O usuário da aplicação possui atributos administrativos inesperados.",
            );
        }

        await client.query(
            `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName.rows[0].name)}
             TO ${quotedRole}`,
        );
        await client.query(`GRANT USAGE ON SCHEMA public TO ${quotedRole}`);
        await client.query(`REVOKE CREATE ON SCHEMA public FROM ${quotedRole}`);
        await client.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE
             ON ALL TABLES IN SCHEMA public TO ${quotedRole}`,
        );
        await client.query(
            `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quotedRole}`,
        );
        await client.query(
            `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${quotedRole}`,
        );
        await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quotedRole}`,
        );
        await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT USAGE, SELECT ON SEQUENCES TO ${quotedRole}`,
        );
        await client.query(
            `ALTER DEFAULT PRIVILEGES IN SCHEMA public
             GRANT EXECUTE ON FUNCTIONS TO ${quotedRole}`,
        );

        await client.query(
            `REVOKE INSERT, UPDATE, DELETE, TRUNCATE
             ON schema_migrations FROM ${quotedRole}`,
        );
        await client.query(`GRANT SELECT ON schema_migrations TO ${quotedRole}`);
        await client.query(
            `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM ${quotedRole}`,
        );
        await client.query(`GRANT SELECT, INSERT ON audit_logs TO ${quotedRole}`);

        const legacyTable = await client.query<{ exists: boolean }>(
            "SELECT TO_REGCLASS('public.usuarios') IS NOT NULL AS exists",
        );
        if (legacyTable.rows[0].exists) {
            await client.query(
                `REVOKE ALL PRIVILEGES ON TABLE usuarios FROM ${quotedRole}`,
            );
        }

        await client.query("COMMIT");
        console.log("Usuário restrito da aplicação configurado com sucesso.");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

void provisionApplicationRole()
    .then(closeMigrationDatabase)
    .catch(async (error) => {
        const safeError = error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: "Erro desconhecido" };
        console.error("Falha ao configurar o usuário restrito da aplicação:", safeError);
        await closeMigrationDatabase();
        process.exit(1);
    });

