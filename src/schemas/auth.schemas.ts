import { z } from "zod";

export const loginSchema = z.object({
    identifier: z.string().trim().min(1).max(255),
    password: z.string().min(8).max(128),
});

export const refreshSessionSchema = z.object({
    refreshToken: z.string().trim().min(32).optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

const mfaCodeSchema = z.string().trim().min(6).max(32).regex(
    /^(?:\d{6}|[A-Fa-f0-9]{6}(?:-?[A-Fa-f0-9]{6}){2})$/,
    "Código MFA inválido.",
);

export const confirmMfaSetupSchema = z.object({
    code: z.string().trim().regex(/^\d{6}$/, "Código TOTP inválido."),
}).strict();

export const verifyMfaLoginSchema = z.object({
    challengeToken: z.string().trim().min(48).max(256),
    code: mfaCodeSchema,
}).strict();

export const disableMfaSchema = z.object({
    password: z.string().min(8).max(128),
    code: mfaCodeSchema,
}).strict();

export type ConfirmMfaSetupInput = z.infer<typeof confirmMfaSetupSchema>;
export type VerifyMfaLoginInput = z.infer<typeof verifyMfaLoginSchema>;
export type DisableMfaInput = z.infer<typeof disableMfaSchema>;
