import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const runScript = (script, environment) => new Promise((resolve) => {
    const child = spawn(
        process.execPath,
        [script],
        {
            cwd: process.cwd(),
            env: { ...process.env, ...environment },
            stdio: ["ignore", "pipe", "pipe"],
            windowsHide: true,
        },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
});

test("cria e restaura uma cópia íntegra dos arquivos privados", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rhumi-file-backup-"));
    const source = join(directory, "source");
    const output = join(directory, "backups");
    try {
        await mkdir(join(source, "company"), { recursive: true });
        await writeFile(join(source, "company", "document.pdf"), "%PDF-test");

        const backup = await runScript("scripts/backup-private-files.mjs", {
            FILE_BACKUP_SOURCE: source,
            FILE_BACKUP_OUTPUT_DIR: output,
        });
        assert.equal(backup.code, 0, backup.stderr);
        const backupResult = JSON.parse(backup.stdout);
        await access(backupResult.backupPath);
        await access(backupResult.manifestPath);

        const verification = await runScript("scripts/verify-latest-file-backup.mjs", {
            FILE_BACKUP_OUTPUT_DIR: output,
        });
        assert.equal(verification.code, 0, verification.stderr);
        assert.equal(JSON.parse(verification.stdout).verified, true);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("impede que o backup seja gravado dentro do próprio volume", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rhumi-file-backup-"));
    const source = join(directory, "source");
    try {
        await mkdir(source, { recursive: true });
        const result = await runScript("scripts/backup-private-files.mjs", {
            FILE_BACKUP_SOURCE: source,
            FILE_BACKUP_OUTPUT_DIR: join(source, "..backup"),
        });
        assert.notEqual(result.code, 0);
        assert.match(result.stderr, /não pode ficar dentro/);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
