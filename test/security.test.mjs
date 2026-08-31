import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";

let server;
let baseUrl;

before(() => {
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
}));

test("aplica cabeçalhos HTTP seguros e não revela a tecnologia", async () => {
    const response = await fetch(baseUrl, {
        headers: { "x-request-id": "identificador-controlado-pelo-cliente" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-powered-by"), null);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.match(response.headers.get("content-security-policy") ?? "", /default-src/);
    assert.match(
        response.headers.get("x-request-id") ?? "",
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
});

test("impede cache de respostas da API", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/me`);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("pragma"), "no-cache");
});

test("aceita somente origens CORS confiáveis", async () => {
    const allowed = await fetch(baseUrl, {
        headers: { origin: "http://localhost:3000" },
    });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:3000");
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");

    const denied = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://evil.example" },
        body: JSON.stringify({ identifier: "unknown@example.com", password: "invalid-password" }),
    });
    const payload = await denied.json();
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(payload.error.code, "UNTRUSTED_REQUEST_ORIGIN");
});

test("exige origem em mutações autenticadas somente por cookie", async () => {
    const response = await fetch(`${baseUrl}/api/v1/auth/logout`, {
        method: "POST",
        headers: { cookie: "access_token=fake-token" },
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.error.code, "REQUEST_ORIGIN_REQUIRED");
});

test("limita tentativas repetidas de login por endereço de origem", async () => {
    let lastResponse;
    for (let attempt = 0; attempt <= 10; attempt += 1) {
        lastResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                identifier: `unknown-${attempt}@example.com`,
                password: "invalid-password",
            }),
        });
    }
    const payload = await lastResponse.json();
    assert.equal(lastResponse.status, 429);
    assert.equal(payload.error.code, "RATE_LIMIT_EXCEEDED");
    assert.ok(lastResponse.headers.get("retry-after"));
});
