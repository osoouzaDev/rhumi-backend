import { readdir } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve(process.env.BACKUP_OUTPUT_DIR ?? "/var/backups/rhumi");
const files = (await readdir(outputDirectory))
    .filter((name) => /^rhumi-.+\.dump$/.test(name))
    .sort()
    .reverse();
if (!files[0]) throw new Error("Nenhum backup foi encontrado para validação.");

process.env.BACKUP_FILE = resolve(outputDirectory, files[0]);
await import("./restore-verify.mjs");
