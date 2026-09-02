import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import net from "node:net";
import { basename, relative, resolve, sep } from "node:path";
import { env } from "../config/env.js";
import { AppError } from "../errors/app-error.js";

export interface FileScanResult {
    status: "not_scanned" | "clean";
    detail: string;
}

const allowedMimeTypes = new Set(
    env.FILE_ALLOWED_MIME_TYPES.split(",").map((item) => item.trim()).filter(Boolean),
);
const storageRoot = resolve(env.FILE_STORAGE_PATH);

const isPrefix = (buffer: Buffer, bytes: number[]): boolean => (
    bytes.every((byte, index) => buffer[index] === byte)
);

const validateMagicBytes = (buffer: Buffer, mimeType: string): boolean => {
    if (mimeType === "application/pdf") return buffer.subarray(0, 5).toString() === "%PDF-";
    if (mimeType === "image/jpeg") return isPrefix(buffer, [0xff, 0xd8, 0xff]);
    if (mimeType === "image/png") {
        return isPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    }
    if (mimeType.includes("officedocument")) {
        return isPrefix(buffer, [0x50, 0x4b, 0x03, 0x04]);
    }
    if (mimeType === "text/plain" || mimeType === "text/csv") {
        if (buffer.includes(0)) return false;
        try {
            new TextDecoder("utf-8", { fatal: true }).decode(buffer);
            return true;
        } catch {
            return false;
        }
    }
    return false;
};

const safeStoragePath = (storageKey: string): string => {
    const candidate = resolve(storageRoot, storageKey);
    const relation = relative(storageRoot, candidate);
    if (!relation || relation.startsWith(`..${sep}`) || relation === "..") {
        throw new AppError(500, "INVALID_STORAGE_KEY", "Chave interna de arquivo inválida.");
    }
    return candidate;
};

const scanWithClamAv = (buffer: Buffer): Promise<string> => new Promise((resolveScan, reject) => {
    const socket = net.createConnection({
        host: env.CLAMAV_HOST,
        port: env.CLAMAV_PORT,
    });
    const responseChunks: Buffer[] = [];
    const timer = setTimeout(() => {
        socket.destroy(new Error("Tempo limite da varredura antimalware excedido."));
    }, env.CLAMAV_TIMEOUT_MS);

    socket.on("connect", () => {
        socket.write("zINSTREAM\0");
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
            const chunk = buffer.subarray(offset, Math.min(offset + 64 * 1024, buffer.length));
            const size = Buffer.allocUnsafe(4);
            size.writeUInt32BE(chunk.length);
            socket.write(size);
            socket.write(chunk);
        }
        socket.end(Buffer.alloc(4));
    });
    socket.on("data", (chunk: Buffer) => responseChunks.push(chunk));
    socket.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
    });
    socket.on("close", (hadError) => {
        clearTimeout(timer);
        if (hadError) return;
        resolveScan(Buffer.concat(responseChunks).toString("utf8").replaceAll("\0", "").trim());
    });
});

export class FileStorageService {
    validate(file: Express.Multer.File): void {
        if (!file.buffer.length) {
            throw new AppError(422, "EMPTY_FILE", "O arquivo enviado está vazio.");
        }
        if (!allowedMimeTypes.has(file.mimetype)) {
            throw new AppError(415, "FILE_TYPE_NOT_ALLOWED", "O tipo do arquivo não é permitido.");
        }
        if (!validateMagicBytes(file.buffer, file.mimetype)) {
            throw new AppError(
                422,
                "FILE_SIGNATURE_MISMATCH",
                "O conteúdo do arquivo não corresponde ao tipo informado.",
            );
        }
    }

    async scan(buffer: Buffer): Promise<FileScanResult> {
        if (!env.FILE_ANTIVIRUS_ENABLED) {
            return { status: "not_scanned", detail: "scanner_disabled_outside_production" };
        }
        let result: string;
        try {
            result = await scanWithClamAv(buffer);
        } catch (error) {
            throw new AppError(
                503,
                "ANTIVIRUS_UNAVAILABLE",
                "A varredura antimalware não está disponível. Tente novamente.",
                { cause: error instanceof Error ? error.message : "unknown" },
            );
        }
        if (result.endsWith("FOUND")) {
            throw new AppError(422, "MALWARE_DETECTED", "O arquivo foi rejeitado pela varredura.");
        }
        if (!result.endsWith("OK")) {
            throw new AppError(503, "ANTIVIRUS_INVALID_RESPONSE", "Resposta antimalware inválida.");
        }
        return { status: "clean", detail: result.slice(0, 255) };
    }

    async write(companyId: string, buffer: Buffer): Promise<{
        storageKey: string;
        sha256: string;
    }> {
        const storageKey = `${companyId}/${randomUUID()}`;
        const target = safeStoragePath(storageKey);
        const temporaryTarget = `${target}.${randomUUID()}.partial`;
        await mkdir(resolve(storageRoot, companyId), { recursive: true });
        try {
            await writeFile(temporaryTarget, buffer, { flag: "wx", mode: 0o600 });
            await rename(temporaryTarget, target);
        } catch (error) {
            await unlink(temporaryTarget).catch(() => undefined);
            throw error;
        }
        return {
            storageKey,
            sha256: createHash("sha256").update(buffer).digest("hex"),
        };
    }

    read(storageKey: string): Promise<Buffer> {
        return readFile(safeStoragePath(storageKey));
    }

    async remove(storageKey: string): Promise<void> {
        try {
            await unlink(safeStoragePath(storageKey));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
    }

    safeOriginalName(name: string): string {
        return basename(name).replace(/[\u0000-\u001f\u007f]/g, "_").slice(0, 255) || "arquivo";
    }
}

export const fileStorageService = new FileStorageService();
