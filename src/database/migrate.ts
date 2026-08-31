import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import database, { closeMigrationDatabase } from "./migration-connection.js";

interface AppliedMigration {
    filename: string;
    checksum: string;
}

const migrationDirectory = resolve(process.cwd(), "database", "migrations");

const migrate = async (): Promise<void> => {
    const client = await database.connect();

    try {
        await client.query("SELECT pg_advisory_lock(hashtext($1))", ["rhumi_schema_migrations"]);
        await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                filename TEXT PRIMARY KEY,
                checksum CHAR(64) NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        const files = (await readdir(migrationDirectory))
            .filter((filename) => /^\d+_[a-z0-9_]+\.sql$/i.test(filename))
            .sort();

        const appliedResult = await client.query<AppliedMigration>(
            "SELECT filename, checksum FROM schema_migrations",
        );
        const appliedMigrations = new Map(
            appliedResult.rows.map((migration) => [migration.filename, migration.checksum]),
        );

        for (const filename of files) {
            const sql = await readFile(resolve(migrationDirectory, filename), "utf8");
            const checksum = createHash("sha256").update(sql).digest("hex");
            const appliedChecksum = appliedMigrations.get(filename);

            if (appliedChecksum) {
                if (appliedChecksum !== checksum) {
                    throw new Error(`A migraÃ§Ã£o jÃ¡ aplicada ${filename} foi modificada.`);
                }

                continue;
            }

            await client.query("BEGIN");
            try {
                await client.query(sql);
                await client.query(
                    "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
                    [filename, checksum],
                );
                await client.query("COMMIT");
                console.log(`MigraÃ§Ã£o aplicada: ${filename}`);
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            }
        }
    } finally {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["rhumi_schema_migrations"]);
        client.release();
    }
};

void migrate()
    .then(async () => {
        console.log("Banco de dados atualizado.");
        await closeMigrationDatabase();
    })
    .catch(async (error) => {
        console.error("Falha ao executar as migraÃ§Ãµes:", error);
        await closeMigrationDatabase();
        process.exit(1);
    });
