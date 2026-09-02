import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { spawn } from "node:child_process";

const sourceDirectory = resolve(process.env.FILE_BACKUP_SOURCE ?? "/var/lib/rhumi/files");
const outputDirectory = resolve(
    process.env.FILE_BACKUP_OUTPUT_DIR ?? "/var/backups/rhumi-files",
);

await access(sourceDirectory);
const outputRelation = relative(sourceDirectory, outputDirectory);
if (!outputRelation || (
    outputRelation !== ".."
    && !outputRelation.startsWith(`..${sep}`)
)) {
    throw new Error("O diretório de backup não pode ficar dentro do armazenamento privado.");
}

await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const finalPath = resolve(outputDirectory, `rhumi-files-${timestamp}.tar.gz`);
const temporaryPath = `${finalPath}.partial`;

await new Promise((resolveRun, rejectRun) => {
    const processHandle = spawn(
        "tar",
        [
            "--create",
            "--gzip",
            "--file",
            temporaryPath,
            "--directory",
            sourceDirectory,
            ".",
        ],
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
await rename(temporaryPath, finalPath);

const checksum = createHash("sha256");
await new Promise((resolveHash, rejectHash) => {
    const stream = createReadStream(finalPath);
    stream.on("data", (chunk) => checksum.update(chunk));
    stream.once("end", resolveHash);
    stream.once("error", rejectHash);
});

const digest = checksum.digest("hex");
const manifestPath = `${finalPath}.sha256`;
await writeFile(manifestPath, `${digest}  ${basename(finalPath)}\n`, {
    encoding: "utf8",
    mode: 0o600,
});

process.stdout.write(JSON.stringify({
    backupPath: finalPath,
    manifestPath,
    sha256: digest,
}));
