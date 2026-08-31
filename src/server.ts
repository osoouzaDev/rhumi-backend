import type { Server } from "node:http";
import app from "./app.js";
import { env } from "./config/env.js";
import { closeRedis, connectToRedis } from "./config/redis.js";
import { closeDatabase, connectToDatabase } from "./database/connection.js";

let server: Server | undefined;
let shuttingDown = false;

const startServer = async (): Promise<void> => {
    await Promise.all([connectToDatabase(), connectToRedis()]);

    server = app.listen(env.PORT, () => {
        console.log(`RHumi API disponível em http://localhost:${env.PORT}`);
    });
    server.requestTimeout = env.REQUEST_TIMEOUT_MS;
    server.headersTimeout = env.HEADERS_TIMEOUT_MS;
};

const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    console.log(`Encerrando a RHumi API após ${signal}...`);

    if (server) {
        await new Promise<void>((resolve, reject) => {
            server?.close((error) => error ? reject(error) : resolve());
        });
    }

    await Promise.all([closeDatabase(), closeRedis()]);
};

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
        void shutdown(signal)
            .then(() => process.exit(0))
            .catch((error) => {
                console.error("Falha ao encerrar a aplicação:", error);
                process.exit(1);
            });
    });
}

void startServer().catch((error) => {
    console.error("Não foi possível iniciar a RHumi API:", error);
    process.exit(1);
});
