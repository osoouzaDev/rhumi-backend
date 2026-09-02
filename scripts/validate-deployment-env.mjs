import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "dotenv";

const path = resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
    throw new Error("Informe o arquivo de ambiente que deve ser validado.");
}

const values = parse(await readFile(path, "utf8"));
const required = [
    "NODE_ENV",
    "CORS_ORIGINS",
    "DATABASE_URL",
    "JWT_SECRET",
    "PUBLIC_APP_URL",
    "MFA_ENCRYPTION_KEY",
    "METRICS_TOKEN",
];

const missing = required.filter((name) => !values[name]);
if (missing.length) {
    throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}.`);
}

const placeholders = Object.entries(values)
    .filter(([, value]) => /CHANGE_ME|replace-with|example\.com/i.test(value))
    .map(([name]) => name);
if (placeholders.length) {
    throw new Error(`Valores de exemplo ainda presentes: ${placeholders.join(", ")}.`);
}

Object.assign(process.env, values, {
    DOTENV_CONFIG_PATH: path,
    DOTENV_CONFIG_OVERRIDE: "true",
});

await import("../dist/config/env.js");
process.stdout.write(JSON.stringify({
    valid: true,
    environment: values.NODE_ENV,
    file: path,
}));
