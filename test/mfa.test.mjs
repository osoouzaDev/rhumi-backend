import assert from "node:assert/strict";
import test from "node:test";
import * as OTPAuth from "otpauth";

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
process.env.MFA_ENABLED = "true";
process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

const mfa = await import("../dist/utils/mfa.js");

test("criptografa o segredo MFA com nonce e autenticação", () => {
    const secret = mfa.generateMfaSecret();
    const first = mfa.encryptMfaSecret(secret);
    const second = mfa.encryptMfaSecret(secret);

    assert.notEqual(first, second);
    assert.notEqual(first, secret);
    assert.equal(mfa.decryptMfaSecret(first), secret);
    assert.equal(mfa.decryptMfaSecret(second), secret);
});

test("gera e valida TOTP e URI de cadastro", () => {
    const secret = mfa.generateMfaSecret();
    const account = "admin@example.com";
    const generator = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(secret),
        algorithm: "SHA1",
        digits: 6,
        period: 30,
    });
    const code = generator.generate();

    assert.ok(Number.isInteger(mfa.verifyTotpCode(secret, account, code)));
    assert.equal(mfa.verifyTotpCode(secret, account, "000000") === null, true);
    assert.ok(mfa.createMfaEnrollmentUri(secret, account).startsWith("otpauth://totp/"));
});

test("gera códigos de recuperação fortes e hashes determinísticos", () => {
    const codes = mfa.generateRecoveryCodes(10);

    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, 10);
    assert.equal(mfa.hashRecoveryCode(codes[0]).length, 64);
    assert.equal(
        mfa.hashRecoveryCode(codes[0]),
        mfa.hashRecoveryCode(codes[0].replaceAll("-", "").toLowerCase()),
    );
});
