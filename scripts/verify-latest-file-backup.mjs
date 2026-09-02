import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
    mkdtemp,
    readFile,
    readdir,
    rm,
} from "node:fs/promises";
import { basename, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const outputDirectory = resolve(
    process.env.FILE_BACKUP_OUTPUT_DIR ?? "/var/backups/rhumi-files",
);
const files = (await readdir(outputDirectory))
    .filter((name) => /^rhumi-files-.+\.tar\.gz$/.test(name))
    .sort()
    .reverse();
if (!files[0]) throw new Error("Nenhum backup de arquivos privados foi encontrado.");

const backupPath = resolve(outputDirectory, files[0]);
const manifestPath = `${backupPath}.sha256`;
const expectedHash = (await readFile(manifestPath, "utf8")).trim().split(/\s+/)[0];
if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error("Manifesto SHA-256 inválido.");
}

const checksum = createHash("sha256");
await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(backupPath);
    stream.on("data", (chunk) => checksum.update(chunk));
    stream.once("end", resolveHash);
    stream.once("error", rejectHash);
});
if (checksum.digest("hex") !== expectedHash) {
    throw new Error("O backup de arquivos privados falhou na verificação SHA-256.");
}

const restoreDirectory = await mkdtemp(resolve(tmpdir(), "rhumi-files-restore-"));
try {
    await new Promise((resolveRun, rejectRun) => {
        const processHandle = spawn(
            "tar",
            ["--extract", "--gzip", "--file", backupPath, "--directory", restoreDirectory],
            {
                stdio: ["ignore", "inherit", "inherit"],
                windowsHide: true,
            },
        );
        processHandle.once("error", rejectRun);
        processHandle.once("exit", (code) => {
            if (code === 0) resolveRun();
            else rejectRun(new Error(`tar terminou com código ${code}.`));
        });
    });
    await readdir(restoreDirectory);
    process.stdout.write(JSON.stringify({
        verified: true,
        backup: basename(backupPath),
    }));
} finally {
    await rm(restoreDirectory, { recursive: true, force: true });
}
