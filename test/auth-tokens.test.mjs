import assert from "node:assert/strict";
import test from "node:test";

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
process.env.ACCESS_TOKEN_EXPIRES_IN_SECONDS = "900";

const tokenModule = await import("../dist/utils/auth-tokens.js");
const schemaModule = await import("../dist/schemas/auth.schemas.js");

test("cria e valida um access token com usuário e sessão", () => {
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const sessionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const companyId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const token = tokenModule.createAccessToken(userId, sessionId, companyId);
    const claims = tokenModule.verifyAccessToken(token);

    assert.equal(claims.userId, userId);
    assert.equal(claims.sessionId, sessionId);
    assert.equal(claims.companyId, companyId);
    assert.ok(claims.tokenId);
    assert.ok(claims.expiresAt > Math.floor(Date.now() / 1_000));
});

test("gera refresh tokens aleatórios e armazena apenas hashes determinísticos", () => {
    const firstToken = tokenModule.createRefreshToken();
    const secondToken = tokenModule.createRefreshToken();

    assert.notEqual(firstToken, secondToken);
    assert.equal(tokenModule.hashRefreshToken(firstToken).length, 64);
    assert.equal(
        tokenModule.hashRefreshToken(firstToken),
        tokenModule.hashRefreshToken(firstToken),
    );
});

test("aceita login por código ou e-mail e rejeita senhas curtas", () => {
    assert.equal(schemaModule.loginSchema.parse({
        identifier: "ADMIN001",
        password: "strong-password",
    }).identifier, "ADMIN001");

    assert.equal(schemaModule.loginSchema.parse({
        identifier: "admin@rhumi.local",
        password: "strong-password",
    }).identifier, "admin@rhumi.local");

    assert.equal(schemaModule.loginSchema.safeParse({
        identifier: "ADMIN001",
        password: "short",
    }).success, false);
});

test("valida tokens opacos e fluxos de senha", () => {
    const token = tokenModule.createOpaqueToken();
    assert.ok(token.length >= 48);
    assert.equal(tokenModule.hashOpaqueToken(token).length, 64);

    assert.equal(schemaModule.activateAccountSchema.safeParse({
        token,
        password: "Nova-Senha-Segura-2026!",
    }).success, true);
    assert.equal(schemaModule.changePasswordSchema.safeParse({
        currentPassword: "Nova-Senha-Segura-2026!",
        newPassword: "Nova-Senha-Segura-2026!",
    }).success, false);
});
