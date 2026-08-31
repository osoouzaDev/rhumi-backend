import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import test from "node:test";

const sourceDirectories = ["database", "docs", "src", "test"];
const rootFiles = [".env.example", "package.json", "README.md"];
const textExtensions = new Set([".example", ".json", ".md", ".mjs", ".sql", ".ts"]);
const corruptedEncodingPattern = /\u00c3(?:[\u0080-\u00bf]|\u0192)|\u00c2[\u0080-\u00bf]|\u00e2(?:\u20ac|\u201a)|\u00c6\u2019|[\u0080-\u009f]/u;

const listTextFiles = async (directory) => {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listTextFiles(path));
        } else if (textExtensions.has(extname(entry.name))) {
            files.push(path);
        }
    }

    return files;
};

test("detecta caracteres corrompidos nos arquivos de texto", async () => {
    const nestedFiles = (await Promise.all(sourceDirectories.map(listTextFiles))).flat();
    const corruptedFiles = [];

    for (const path of [...rootFiles, ...nestedFiles]) {
        const content = await readFile(path, "utf8");
        if (corruptedEncodingPattern.test(content)) {
            corruptedFiles.push(path);
        }
    }

    assert.deepEqual(corruptedFiles, []);
});
