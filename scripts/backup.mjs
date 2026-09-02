import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

const connectionString = process.env.BACKUP_DATABASE_URL;
if (!connectionString) throw new Error("BACKUP_DATABASE_URL não foi definida.");

const outputDirectory = resolve(process.env.BACKUP_OUTPUT_DIR ?? "./backups");
await mkdir(outputDirectory, { recursive: true, mode: 0o700 });

const source = new URL(connectionString);
const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const finalPath = resolve(outputDirectory, `rhumi-${timestamp}.dump`);
const temporaryPath = `${finalPath}.partial`;
const childEnvironment = {
    ...process.env,
    PGPASSWORD: decodeURIComponent(source.password),
    PGSSLMODE: source.searchParams.get("sslmode") ?? process.env.PGSSLMODE ?? "prefer",
};
const argumentsList = [
    "--format=custom",
    "--compress=9",
    "--no-owner",
    "--no-acl",
    "--file",
    temporaryPath,
    "--host",
    source.hostname,
    "--port",
    source.port || "5432",
    "--username",
    decodeURIComponent(source.username),
    decodeURIComponent(source.pathname.slice(1)),
];

await new Promise((resolveRun, rejectRun) => {
    const processHandle = spawn("pg_dump", argumentsList, {
        env: childEnvironment,
        stdio: ["ignore", "inherit", "inherit"],
        windowsHide: true,
    });
    processHandle.once("error", rejectRun);
    processHandle.once("exit", (code) => {
        if (code === 0) resolveRun();
        else rejectRun(new Error(`pg_dump terminou com código ${code}.`));
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
process.stdout.write(JSON.stringify({ backupPath: finalPath, manifestPath, sha256: digest }));
