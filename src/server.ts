import type { Server } from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import { closeRedis, connectToRedis } from "./config/redis.js";
import { closeDatabase, connectToDatabase } from "./database/connection.js";
import { startBackgroundWorkers, stopBackgroundWorkers } from "./services/background-workers.service.js";
import { logger } from "./utils/logger.js";

let server: Server | undefined;
let shuttingDown = false;

const startServer = async (): Promise<void> => {
    await Promise.all([connectToDatabase(), connectToRedis()]);

    server = app.listen(env.PORT, () => {
        logger.info("server.started", { port: env.PORT });
    });
    server.requestTimeout = env.REQUEST_TIMEOUT_MS;
    server.headersTimeout = env.HEADERS_TIMEOUT_MS;
    startBackgroundWorkers();
};

const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    logger.info("server.shutdown_started", { signal });

    if (server) {
        await new Promise<void>((resolve, reject) => {
            server?.close((error) => error ? reject(error) : resolve());
        });
    }

    await stopBackgroundWorkers();
    await Promise.all([closeDatabase(), closeRedis()]);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        void shutdown(signal)
            .then(() => process.exit(0))
            .catch((error) => {
                logger.error("server.shutdown_failed", { error });
                process.exit(1);
            });
    });
}

void startServer().catch((error) => {
    logger.error("server.start_failed", { error });
    process.exit(1);
});
