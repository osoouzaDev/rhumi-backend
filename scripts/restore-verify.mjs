import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import pg from "pg";

const backupPath = process.env.BACKUP_FILE;
const adminConnectionString = process.env.RESTORE_TEST_ADMIN_URL;
if (!backupPath || !adminConnectionString) {
    throw new Error("BACKUP_FILE e RESTORE_TEST_ADMIN_URL são obrigatórias.");
}
await access(backupPath);

const databaseName = `rhumi_restore_verify_${Date.now()}_${process.pid}`;
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const admin = new pg.Client({ connectionString: adminConnectionString });
await admin.connect();

const restoredUrl = new URL(adminConnectionString);
restoredUrl.pathname = `/${databaseName}`;

try {
    await admin.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    await new Promise((resolveRun, rejectRun) => {
        const processHandle = spawn(
            "pg_restore",
            [
                "--exit-on-error",
                "--no-owner",
                "--no-acl",
                `--dbname=${restoredUrl.toString()}`,
                backupPath,
            ],
            { stdio: ["ignore", "inherit", "inherit"], windowsHide: true },
        );
        processHandle.once("error", rejectRun);
        processHandle.once("exit", (code) => {
            if (code === 0) resolveRun();
            else rejectRun(new Error(`pg_restore terminou com código ${code}.`));
        });
    });

    const restored = new pg.Client({ connectionString: restoredUrl.toString() });
    await restored.connect();
    try {
        const result = await restored.query(
            `SELECT
                TO_REGCLASS('public.schema_migrations') IS NOT NULL AS has_migrations,
                TO_REGCLASS('public.companies') IS NOT NULL AS has_companies,
                TO_REGCLASS('public.audit_logs') IS NOT NULL AS has_audit_logs`,
        );
        if (!result.rows[0].has_migrations
            || !result.rows[0].has_companies
            || !result.rows[0].has_audit_logs) {
            throw new Error("A restauração não contém o esquema mínimo esperado.");
        }
    } finally {
        await restored.end();
    }
    process.stdout.write(JSON.stringify({ verified: true, databaseName }));
} finally {
    await admin.query(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
         WHERE datname = $1 AND pid <> pg_backend_pid()`,
        [databaseName],
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
    await admin.end();
}
