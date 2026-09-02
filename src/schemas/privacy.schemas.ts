import { z } from "zod";
import { paginationQueryShape, uuidSchema } from "./common.schemas.js";

export const recordConsentSchema = z.object({
    purpose: z.string().trim().min(3).max(120),
    policyVersion: z.string().trim().min(1).max(80),
    legalBasis: z.string().trim().min(2).max(80),
    granted: z.boolean(),
}).strict();

export const privacyRequestTypeSchema = z.enum(["export", "anonymization", "deletion"]);

export const createPrivacyRequestSchema = z.object({
    type: privacyRequestTypeSchema,
    reason: z.string().trim().min(3).max(2_000).optional(),
}).strict();

export const privacyRequestListQuerySchema = z.object({
    ...paginationQueryShape,
    status: z.enum(["pending", "processing", "completed", "rejected"]).optional(),
    employeeId: uuidSchema.optional(),
    type: privacyRequestTypeSchema.optional(),
}).strict();

export const processPrivacyRequestSchema = z.object({
    decision: z.enum(["approve", "reject"]),
    notes: z.string().trim().min(3).max(4_000),
    confirmIrreversibleAnonymization: z.literal(true).optional(),
}).strict();

export type RecordConsentInput = z.infer<typeof recordConsentSchema>;
export type CreatePrivacyRequestInput = z.infer<typeof createPrivacyRequestSchema>;
export type PrivacyRequestListQuery = z.infer<typeof privacyRequestListQuerySchema>;
export type ProcessPrivacyRequestInput = z.infer<typeof processPrivacyRequestSchema>;
