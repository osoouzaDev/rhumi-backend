import assert from "node:assert/strict";
import { after, before, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DB_HOST = "localhost";
process.env.DB_PORT = "5432";
process.env.DB_USER = "postgres";
process.env.DB_PASSWORD = "test-password";
process.env.DB_NAME = "rhumi_test";
process.env.DB_SSL = "false";
process.env.JWT_SECRET = "test-secret-with-more-than-32-characters-long";
process.env.JWT_ISSUER = "rhumi-api-test";
process.env.JWT_AUDIENCE = "rhumi-client-test";
process.env.CORS_ORIGINS = "http://localhost:3000";

const { default: app } = await import("../dist/app.js");

let server;
let baseUrl;

before(async () => {
    await new Promise((resolve) => {
        server = app.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
});

test("expõe informações básicas da API", async () => {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.name, "RHumi API");
    assert.equal(body.version, "v1");
    assert.ok(response.headers.get("x-request-id"));
});

test("retorna erros de validação em formato padronizado", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: "", password: "short" }),
    });
    const body = await response.json();

    assert.equal(response.status, 422);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(body.error.requestId);
});

test("retorna 404 padronizado para rotas inexistentes", async () => {
    const response = await fetch(`${baseUrl}/does-not-exist`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error.code, "ROUTE_NOT_FOUND");
});
