import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    randomBytes,
} from "node:crypto";
import * as OTPAuth from "otpauth";
import { env } from "../config/env.js";

const encryptionKey = env.MFA_ENCRYPTION_KEY
    ? Buffer.from(env.MFA_ENCRYPTION_KEY, "base64")
    : undefined;

const requireEncryptionKey = (): Buffer => {
    if (!env.MFA_ENABLED || !encryptionKey || encryptionKey.length !== 32) {
        throw new Error("MFA nÃ£o estÃ¡ configurado neste ambiente.");
    }
    return encryptionKey;
};

const totp = (secret: string, accountName: string): OTPAuth.TOTP => new OTPAuth.TOTP({
    issuer: env.MFA_ISSUER,
    label: accountName,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
});

export const generateMfaSecret = (): string => (
    new OTPAuth.Secret({ size: 20 }).base32
);

export const createMfaEnrollmentUri = (
    secret: string,
    accountName: string,
): string => totp(secret, accountName).toString();

export const verifyTotpCode = (
    secret: string,
    accountName: string,
    code: string,
): number | null => {
    const period = 30;
    const delta = totp(secret, accountName).validate({
        token: code,
        window: 1,
    });
    if (delta === null) return null;
    return Math.floor(Date.now() / 1_000 / period) + delta;
};

export const encryptMfaSecret = (secret: string): string => {
    const key = requireEncryptionKey();
    const initializationVector = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, initializationVector);
    const encrypted = Buffer.concat([
        cipher.update(secret, "utf8"),
        cipher.final(),
    ]);
    const authenticationTag = cipher.getAuthTag();

    return [
        "v1",
        initializationVector.toString("base64url"),
        authenticationTag.toString("base64url"),
        encrypted.toString("base64url"),
    ].join(".");
};

export const decryptMfaSecret = (encryptedSecret: string): string => {
    const key = requireEncryptionKey();
    const [version, initializationVector, authenticationTag, encrypted] = (
        encryptedSecret.split(".")
    );
    if (
        version !== "v1"
        || !initializationVector
        || !authenticationTag
        || !encrypted
    ) {
        throw new Error("Segredo MFA criptografado invÃ¡lido.");
    }

    const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(initializationVector, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(authenticationTag, "base64url"));
    return Buffer.concat([
        decipher.update(Buffer.from(encrypted, "base64url")),
        decipher.final(),
    ]).toString("utf8");
};

export const generateRecoveryCodes = (count: number): string[] => (
    Array.from({ length: count }, () => {
        const value = randomBytes(9).toString("hex").toUpperCase();
        return value.match(/.{1,6}/g)?.join("-") ?? value;
    })
);

const normalizeRecoveryCode = (code: string): string => (
    code.replaceAll("-", "").trim().toUpperCase()
);

export const hashRecoveryCode = (code: string): string => createHmac(
    "sha256",
    requireEncryptionKey(),
).update(normalizeRecoveryCode(code)).digest("hex");

export const hashMfaChallenge = (challenge: string): string => createHash("sha256")
    .update(challenge)
    .digest("hex");

export const createMfaChallenge = (): string => randomBytes(48).toString("base64url");

export const isTotpCode = (code: string): boolean => /^\d{6}$/.test(code);
