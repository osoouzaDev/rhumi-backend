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

test("protege as rotas de contas, perfis e permissões", async () => {
    const paths = [
        "/api/v1/users",
        "/api/v1/users/roles",
        "/api/v1/users/permissions",
        "/api/v1/users/9fe7f5b9-f108-4972-9368-e0fba9076b71",
    ];

    for (const path of paths) {
        const response = await fetch(`${baseUrl}${path}`);
        const payload = await response.json();
        assert.equal(response.status, 401, path);
        assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED", path);
    }
});
