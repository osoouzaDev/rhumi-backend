import database, { closeDatabase } from "./connection.js";

interface TableRow {
    table_name: string;
}

interface MigrationRow {
    filename: string;
    applied_at: Date;
}

const showDatabaseStatus = async (): Promise<void> => {
    const tableResult = await database.query<TableRow>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
         ORDER BY table_name`,
    );
    const migrationsTableExists = tableResult.rows.some(
        (row) => row.table_name === "schema_migrations",
    );

    console.log(`Tabelas públicas (${tableResult.rowCount ?? 0}):`);
    console.log(tableResult.rows.map((row) => row.table_name).join(", ") || "nenhuma");

    if (!migrationsTableExists) {
        console.log("Migrations aplicadas: nenhuma");
        return;
    }

    const migrationResult = await database.query<MigrationRow>(
        `SELECT filename, applied_at
         FROM schema_migrations
         ORDER BY filename`,
    );
    console.log("Migrations aplicadas:");
    for (const migration of migrationResult.rows) {
        console.log(`- ${migration.filename} (${migration.applied_at.toISOString()})`);
    }
};

showDatabaseStatus()
    .catch((error: unknown) => {
        console.error("Não foi possível consultar o status do banco:", error);
        process.exitCode = 1;
    })
    .finally(closeDatabase);
