import { RedisStore } from "rate-limit-redis";
import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";

const redisClient: RedisClientType | undefined = env.RATE_LIMIT_STORE === "redis"
    ? createClient({
        url: env.REDIS_URL,
        socket: {
            connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
            reconnectStrategy(retries) {
                return Math.min(100 * 2 ** retries, 5_000);
            },
        },
    })
    : undefined;

redisClient?.on("error", (error) => {
    console.error("Falha na conexão Redis:", {
        name: error.name,
        message: error.message,
    });
});

export const createRateLimitStore = (
    scope: string,
): RedisStore | undefined => {
    if (!redisClient) return undefined;

    return new RedisStore({
        prefix: `${env.REDIS_KEY_PREFIX}${scope}:`,
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    });
};

export const connectToRedis = async (): Promise<void> => {
    if (redisClient && !redisClient.isOpen) {
        await redisClient.connect();
    }
};

export const closeRedis = async (): Promise<void> => {
    if (redisClient?.isOpen) {
        await redisClient.quit();
    }
};

export const checkRedisHealth = async (): Promise<"up" | "disabled"> => {
    if (!redisClient) return "disabled";
    if (!redisClient.isReady) {
        throw new Error("Redis indisponível.");
    }
    await redisClient.ping();
    return "up";
};

