import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenClaims {
    userId: string;
    sessionId: string;
    companyId: string;
    tokenId: string;
    expiresAt: number;
}

export const createRefreshToken = (): string => randomBytes(48).toString("base64url");

export const createOpaqueToken = (): string => randomBytes(48).toString("base64url");

export const hashRefreshToken = (token: string): string => createHash("sha256")
    .update(token)
    .digest("hex");

export const hashOpaqueToken = (token: string): string => createHash("sha256")
    .update(token)
    .digest("hex");

export const createAccessToken = (
    userId: string,
    sessionId: string,
    companyId: string,
): string => jwt.sign(
    { sid: sessionId, cid: companyId },
    env.JWT_SECRET,
    {
        algorithm: "HS256",
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
        subject: userId,
        jwtid: randomUUID(),
        expiresIn: env.ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    },
);

export const verifyAccessToken = (token: string): AccessTokenClaims => {
    const verificationOptions: jwt.VerifyOptions = {
        algorithms: ["HS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
    };
    let decoded: jwt.JwtPayload | string;
    try {
        decoded = jwt.verify(token, env.JWT_SECRET, verificationOptions);
    } catch (currentError) {
        if (!env.JWT_PREVIOUS_SECRET) throw currentError;
        decoded = jwt.verify(token, env.JWT_PREVIOUS_SECRET, verificationOptions);
    }

    if (
        typeof decoded === "string"
        || typeof decoded.sub !== "string"
        || typeof decoded.sid !== "string"
        || typeof decoded.cid !== "string"
        || typeof decoded.jti !== "string"
        || typeof decoded.exp !== "number"
    ) {
        throw new Error("Token de acesso sem as claims obrigatórias.");
    }

    return {
        userId: decoded.sub,
        sessionId: decoded.sid,
        companyId: decoded.cid,
        tokenId: decoded.jti,
        expiresAt: decoded.exp,
    };
};
