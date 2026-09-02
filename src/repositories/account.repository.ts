import type { PoolClient } from "pg";
import database from "../database/connection.js";

export type AccountTokenPurpose = "activation" | "password_reset" | "email_verification";

export interface AccountRecipient {
    userId: string;
    companyId: string;
    fullName: string;
    email: string;
    passwordHash: string;
    status: "active" | "blocked" | "inactive";
    activatedAt: Date | null;
    emailVerifiedAt: Date | null;
}

export interface AccountSession {
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date;
    current: boolean;
}

interface AccountRecipientRow {
    user_id: string;
    company_id: string;
    full_name: string;
    email: string;
    password_hash: string;
    status: AccountRecipient["status"];
    activated_at: Date | null;
    email_verified_at: Date | null;
}

interface AccountSessionRow {
    id: string;
    ip_address: string | null;
    user_agent: string | null;
    created_at: Date;
    last_used_at: Date | null;
    expires_at: Date;
}

interface IssueTokenInput {
    companyId: string;
    userId: string;
    purpose: AccountTokenPurpose;
    tokenHash: string;
    rawToken: string;
    actionUrl: string;
    expiresAt: Date;
    createdByUserId?: string;
    requestIp?: string;
    recipient: string;
    fullName: string;
    subject: string;
}

const mapRecipient = (row: AccountRecipientRow): AccountRecipient => ({
    userId: row.user_id,
    companyId: row.company_id,
    fullName: row.full_name,
    email: row.email,
    passwordHash: row.password_hash,
    status: row.status,
    activatedAt: row.activated_at,
    emailVerifiedAt: row.email_verified_at,
});

const tokenEvent = (purpose: AccountTokenPurpose): string => ({
    activation: "auth.activation_requested",
    password_reset: "auth.password_reset_requested",
    email_verification: "auth.email_verification_requested",
})[purpose];

const consumedEvent = (purpose: AccountTokenPurpose): string => ({
    activation: "auth.account_activated",
    password_reset: "auth.password_reset_completed",
    email_verification: "auth.email_verified",
})[purpose];

export class AccountRepository {
    async findRecipient(userId: string): Promise<AccountRecipient | null> {
        const result = await database.query<AccountRecipientRow>(
            `SELECT users.id AS user_id, employees.company_id, employees.full_name,
                    employees.email, users.password_hash, users.status,
                    users.activated_at, users.email_verified_at
             FROM users
             INNER JOIN employees ON employees.id = users.employee_id
             WHERE users.id = $1
               AND users.deleted_at IS NULL
               AND employees.deleted_at IS NULL
             LIMIT 1`,
            [userId],
        );
        return result.rows[0] ? mapRecipient(result.rows[0]) : null;
    }

    async issueToken(input: IssueTokenInput): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `UPDATE account_tokens
                 SET consumed_at = COALESCE(consumed_at, NOW())
                 WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
                [input.userId, input.purpose],
            );
            await client.query(
                `INSERT INTO account_tokens (
                    company_id, user_id, purpose, token_hash, expires_at,
                    created_by_user_id, request_ip
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [
                    input.companyId,
                    input.userId,
                    input.purpose,
                    input.tokenHash,
                    input.expiresAt,
                    input.createdByUserId ?? null,
                    input.requestIp ?? null,
                ],
            );
            await client.query(
                `INSERT INTO email_outbox (
                    company_id, recipient, template, subject, payload
                 ) VALUES ($1, $2, $3, $4, $5::JSONB)`,
                [
                    input.companyId,
                    input.recipient,
                    input.purpose,
                    input.subject,
                    JSON.stringify({
                        fullName: input.fullName,
                        actionUrl: input.actionUrl,
                        token: input.rawToken,
                        expiresAt: input.expiresAt.toISOString(),
                    }),
                ],
            );
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, context
                 ) VALUES ($1, $2, $3, 'user', $4, $5::JSONB)`,
                [
                    input.companyId,
                    input.createdByUserId ?? null,
                    tokenEvent(input.purpose),
                    input.userId,
                    JSON.stringify({ requestIp: input.requestIp ?? null }),
                ],
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async consumeToken(
        tokenHash: string,
        purpose: AccountTokenPurpose,
        passwordHash?: string,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const token = await client.query<{
                id: string;
                user_id: string;
                company_id: string;
            }>(
                `SELECT id, user_id, company_id
                 FROM account_tokens
                 WHERE token_hash = $1
                   AND purpose = $2
                   AND consumed_at IS NULL
                   AND expires_at > NOW()
                 FOR UPDATE`,
                [tokenHash, purpose],
            );
            const row = token.rows[0];
            if (!row) {
                await client.query("ROLLBACK");
                return false;
            }

            if (purpose === "email_verification") {
                await client.query(
                    `UPDATE users SET email_verified_at = NOW() WHERE id = $1`,
                    [row.user_id],
                );
            } else {
                if (!passwordHash) {
                    throw new Error("A password hash is required for this account token.");
                }
                await client.query(
                    `UPDATE users
                     SET password_hash = $2,
                         status = 'active',
                         activated_at = COALESCE(activated_at, NOW()),
                         email_verified_at = COALESCE(email_verified_at, NOW()),
                         password_changed_at = NOW(),
                         failed_login_attempts = 0,
                         locked_until = NULL
                     WHERE id = $1`,
                    [row.user_id, passwordHash],
                );
                await client.query(
                    `UPDATE sessions
                     SET revoked_at = COALESCE(revoked_at, NOW()),
                         revocation_reason = COALESCE(revocation_reason, $2)
                     WHERE user_id = $1 AND revoked_at IS NULL`,
                    [row.user_id, purpose],
                );
            }

            await client.query(
                `UPDATE account_tokens
                 SET consumed_at = COALESCE(consumed_at, NOW())
                 WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
                [row.user_id, purpose],
            );
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id
                 ) VALUES ($1, $2, $3, 'user', $2)`,
                [row.company_id, row.user_id, consumedEvent(purpose)],
            );
            await client.query("COMMIT");
            return true;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async changePassword(
        userId: string,
        currentSessionId: string,
        passwordHash: string,
    ): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `UPDATE users
                 SET password_hash = $2, password_changed_at = NOW(),
                     failed_login_attempts = 0, locked_until = NULL
                 WHERE id = $1`,
                [userId, passwordHash],
            );
            await client.query(
                `UPDATE sessions
                 SET revoked_at = NOW(), revocation_reason = 'password_changed'
                 WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
                [userId, currentSessionId],
            );
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id
                 ) SELECT employees.company_id, users.id, 'auth.password_changed',
                          'user', users.id
                   FROM users
                   INNER JOIN employees ON employees.id = users.employee_id
                   WHERE users.id = $1`,
                [userId],
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async listSessions(userId: string, currentSessionId: string): Promise<AccountSession[]> {
        const result = await database.query<AccountSessionRow>(
            `SELECT id, ip_address, user_agent, created_at, last_used_at, expires_at
             FROM sessions
             WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > NOW()
             ORDER BY created_at DESC`,
            [userId],
        );
        return result.rows.map((row) => ({
            id: row.id,
            ipAddress: row.ip_address,
            userAgent: row.user_agent,
            createdAt: row.created_at,
            lastUsedAt: row.last_used_at,
            expiresAt: row.expires_at,
            current: row.id === currentSessionId,
        }));
    }

    async revokeOwnedSession(userId: string, sessionId: string): Promise<boolean> {
        const result = await database.query<{ id: string }>(
            `UPDATE sessions
             SET revoked_at = NOW(), revocation_reason = 'device_revoked'
             WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
             RETURNING id`,
            [sessionId, userId],
        );
        return Boolean(result.rows[0]);
    }
}

export const accountRepository = new AccountRepository();
