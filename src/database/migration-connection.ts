import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool, type PoolConfig } from "pg";
import { env } from "../config/env.js";

const certificateAuthority = env.DB_SSL_CA_PATH
    ? readFileSync(resolve(env.DB_SSL_CA_PATH), "utf8")
    : undefined;

const ssl = env.DB_SSL
    ? {
        rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
        ...(certificateAuthority ? { ca: certificateAuthority } : {}),
    }
    : undefined;

const migrationConfiguration: PoolConfig = env.DATABASE_MIGRATION_URL
    ? { connectionString: env.DATABASE_MIGRATION_URL, ssl }
    : env.DB_MIGRATION_USER && env.DB_MIGRATION_PASSWORD
        ? {
            host: env.DB_HOST,
            port: env.DB_PORT,
            user: env.DB_MIGRATION_USER,
            password: env.DB_MIGRATION_PASSWORD,
            database: env.DB_NAME,
            ssl,
        }
        : env.DATABASE_URL
            ? { connectionString: env.DATABASE_URL, ssl }
            : {
                host: env.DB_HOST,
                port: env.DB_PORT,
                user: env.DB_USER,
                password: env.DB_PASSWORD,
                database: env.DB_NAME,
                ssl,
            };

const migrationDatabase = new Pool({
    ...migrationConfiguration,
    application_name: "rhumi-migrations",
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

export const closeMigrationDatabase = async (): Promise<void> => {
    await migrationDatabase.end();
};

export default migrationDatabase;
