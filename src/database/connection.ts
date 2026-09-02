import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    Pool,
    type PoolClient,
    type PoolConfig,
    type QueryConfig,
    type QueryResult,
    type QueryResultRow,
} from "pg";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { getTenantCompanyId } from "./tenant-context.js";

const certificateAuthority = env.DB_SSL_CA_PATH
    ? readFileSync(resolve(env.DB_SSL_CA_PATH), "utf8")
    : undefined;

const ssl = env.DB_SSL
    ? {
        rejectUnauthorized: env.DB_SSL_REJECT_UNAUTHORIZED,
        ...(certificateAuthority ? { ca: certificateAuthority } : {}),
    }
    : undefined;

const databaseConfiguration: PoolConfig = env.DATABASE_URL
    ? {
        connectionString: env.DATABASE_URL,
        ssl,
    }
    : {
        host: env.DB_HOST,
        port: env.DB_PORT,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
        database: env.DB_NAME,
        ssl,
    };

const pool = new Pool({
    ...databaseConfiguration,
    application_name: "rhumi-api",
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

pool.on("error", (error) => {
    const safeError = {
        name: error.name,
        message: error.message,
        code: "code" in error ? error.code : undefined,
    };
    logger.error("database.pool_error", { error: safeError });
});

const setTenantContext = async (
    client: PoolClient,
    companyId: string,
): Promise<void> => {
    await client.query(
        "SELECT set_config('rhumi.company_id', $1, TRUE)",
        [companyId],
    );
};

const tenantAwareConnect = async (): Promise<PoolClient> => {
    const client = await pool.connect();
    const companyId = getTenantCompanyId();
    if (!companyId) {
        return client;
    }

    await client.query(
        "SELECT set_config('rhumi.company_id', $1, FALSE)",
        [companyId],
    );
    const originalRelease = client.release.bind(client);
    let released = false;
    client.release = ((releaseError?: Error | boolean) => {
        if (released) return;
        released = true;
        if (releaseError) {
            originalRelease(releaseError);
            return;
        }

        void client.query("RESET rhumi.company_id")
            .then(() => originalRelease())
            .catch((resetError: Error) => originalRelease(resetError));
    }) as PoolClient["release"];

    return client;
};

interface TenantAwareDatabase {
    query<Row extends QueryResultRow = QueryResultRow>(
        queryTextOrConfig: string | QueryConfig,
        values?: unknown[],
    ): Promise<QueryResult<Row>>;
    connect(): Promise<PoolClient>;
    end(): Promise<void>;
}

const database: TenantAwareDatabase = {
    async query<Row extends QueryResultRow = QueryResultRow>(
        queryTextOrConfig: string | QueryConfig,
        values?: unknown[],
    ): Promise<QueryResult<Row>> {
        const companyId = getTenantCompanyId();
        if (!companyId) {
            return pool.query<Row>(queryTextOrConfig as string, values);
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await setTenantContext(client, companyId);
            const result = typeof queryTextOrConfig === "string"
                ? await client.query<Row>(queryTextOrConfig, values)
                : await client.query<Row>(queryTextOrConfig);
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    },
    connect: tenantAwareConnect,
    end: () => pool.end(),
};

export const connectToDatabase = async (): Promise<void> => {
    await database.query("SELECT 1");
};

export const closeDatabase = async (): Promise<void> => {
    await database.end();
};

export const checkDatabaseHealth = async (): Promise<void> => {
    await database.query("SELECT 1");
};

export default database;
