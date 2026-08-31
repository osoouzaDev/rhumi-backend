import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";

let server;
let baseUrl;

before(() => {
    server = app.listen(0);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
}));

test("protege todas as rotas do núcleo cadastral", async () => {
    const paths = [
        "/api/v1/companies/current",
        "/api/v1/departments",
        "/api/v1/positions",
        "/api/v1/employees",
        "/api/v1/employees/me",
    ];

    for (const path of paths) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
