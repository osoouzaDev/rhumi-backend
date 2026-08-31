import database, { closeDatabase } from "./connection.js";

interface PermissionStatusRow {
    current_user: string;
    current_database: string;
    database_owner: string;
    schema_owner: string;
    can_use_schema: boolean;
    can_create_in_schema: boolean;
    is_superuser: boolean;
    can_create_database: boolean;
    can_create_role: boolean;
    can_bypass_rls: boolean;
    can_modify_audit_logs: boolean;
    can_write_schema_migrations: boolean;
    can_read_legacy_users: boolean;
    can_execute_tenant_resolvers: boolean;
    rls_enabled_tables: number;
}

const yesOrNo = (value: boolean): string => value ? "sim" : "não";

const showPermissionStatus = async (): Promise<void> => {
    const result = await database.query<PermissionStatusRow>(
        `SELECT
            CURRENT_USER AS current_user,
            CURRENT_DATABASE() AS current_database,
            pg_get_userbyid(databases.datdba) AS database_owner,
            namespaces.nspowner::REGROLE::TEXT AS schema_owner,
            has_schema_privilege(CURRENT_USER, 'public', 'USAGE') AS can_use_schema,
            has_schema_privilege(CURRENT_USER, 'public', 'CREATE') AS can_create_in_schema,
            roles.rolsuper AS is_superuser,
            roles.rolcreatedb AS can_create_database,
            roles.rolcreaterole AS can_create_role,
            roles.rolbypassrls AS can_bypass_rls,
            (
                has_table_privilege(CURRENT_USER, 'public.audit_logs', 'UPDATE')
                OR has_table_privilege(CURRENT_USER, 'public.audit_logs', 'DELETE')
            ) AS can_modify_audit_logs,
            (
                has_table_privilege(CURRENT_USER, 'public.schema_migrations', 'INSERT')
                OR has_table_privilege(CURRENT_USER, 'public.schema_migrations', 'UPDATE')
                OR has_table_privilege(CURRENT_USER, 'public.schema_migrations', 'DELETE')
            ) AS can_write_schema_migrations,
            has_table_privilege(CURRENT_USER, 'public.usuarios', 'SELECT')
                AS can_read_legacy_users,
            (
                has_function_privilege(
                    CURRENT_USER,
                    'public.rhumi_resolve_login_company(text)',
                    'EXECUTE'
                )
                AND has_function_privilege(
                    CURRENT_USER,
                    'public.rhumi_resolve_refresh_company(text)',
                    'EXECUTE'
                )
                AND has_function_privilege(
                    CURRENT_USER,
                    'public.rhumi_resolve_mfa_challenge_company(text)',
                    'EXECUTE'
                )
            ) AS can_execute_tenant_resolvers,
            (
                SELECT COUNT(*)::INTEGER
                FROM pg_class AS classes
                INNER JOIN pg_namespace AS table_namespaces
                    ON table_namespaces.oid = classes.relnamespace
                WHERE table_namespaces.nspname = 'public'
                  AND classes.relkind = 'r'
                  AND classes.relrowsecurity = TRUE
            ) AS rls_enabled_tables
         FROM pg_database AS databases
         CROSS JOIN pg_namespace AS namespaces
         JOIN pg_roles AS roles ON roles.rolname = CURRENT_USER
         WHERE databases.datname = CURRENT_DATABASE()
           AND namespaces.nspname = 'public'`,
    );
    const status = result.rows[0];

    console.log(`Usuário atual: ${status.current_user}`);
    console.log(`Banco atual: ${status.current_database}`);
    console.log(`Proprietário do banco: ${status.database_owner}`);
    console.log(`Proprietário do schema public: ${status.schema_owner}`);
    console.log(`Pode usar o schema: ${yesOrNo(status.can_use_schema)}`);
    console.log(`Pode criar no schema: ${yesOrNo(status.can_create_in_schema)}`);
    console.log(`É superusuário: ${yesOrNo(status.is_superuser)}`);
    console.log(`Pode criar bancos: ${yesOrNo(status.can_create_database)}`);
    console.log(`Pode criar perfis: ${yesOrNo(status.can_create_role)}`);
    console.log(`Pode ignorar RLS: ${yesOrNo(status.can_bypass_rls)}`);
    console.log(
        `Pode alterar ou excluir auditoria: ${yesOrNo(status.can_modify_audit_logs)}`,
    );
    console.log(
        `Pode adulterar histórico de migrations: `
        + yesOrNo(status.can_write_schema_migrations),
    );
    console.log(
        `Pode ler a tabela legada usuarios: ${yesOrNo(status.can_read_legacy_users)}`,
    );
    console.log(
        `Pode executar resolvedores seguros de empresa: `
        + yesOrNo(status.can_execute_tenant_resolvers),
    );
    console.log(`Tabelas protegidas por RLS: ${status.rls_enabled_tables}`);
};

showPermissionStatus()
    .catch((error: unknown) => {
        const safeError = error instanceof Error
            ? { name: error.name, message: error.message }
            : { message: "Erro desconhecido" };
        console.error("Não foi possível consultar as permissões do banco:", safeError);
        process.exitCode = 1;
    })
    .finally(closeDatabase);
