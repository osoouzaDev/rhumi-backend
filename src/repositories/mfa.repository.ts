import database from "../database/connection.js";
import type { AuthenticationContext, SessionMetadata } from "./auth.repository.js";

export interface MfaSettings {
    enabled: boolean;
    secretEncrypted: string | null;
    pendingSecretEncrypted: string | null;
    recoveryCodeHashes: string[];
    verifiedAt: Date | null;
    lastTotpCounter: number | null;
}

export interface MfaLoginChallenge {
    id: string;
    userId: string;
    employeeId: string;
    companyId: string;
    employeeCode: string;
    fullName: string;
    email: string;
    secretEncrypted: string;
    recoveryCodeHashes: string[];
    lastTotpCounter: number | null;
}

interface MfaSettingsRow {
    enabled: boolean;
    secret_encrypted: string | null;
    pending_secret_encrypted: string | null;
    recovery_code_hashes: string[];
    verified_at: Date | null;
    last_totp_counter: string | null;
}

interface MfaLoginChallengeRow {
    id: string;
    user_id: string;
    employee_id: string;
    company_id: string;
    employee_code: string;
    full_name: string;
    email: string;
    secret_encrypted: string;
    recovery_code_hashes: string[];
    last_totp_counter: string | null;
}

const mapSettings = (row: MfaSettingsRow): MfaSettings => ({
    enabled: row.enabled,
    secretEncrypted: row.secret_encrypted,
    pendingSecretEncrypted: row.pending_secret_encrypted,
    recoveryCodeHashes: row.recovery_code_hashes,
    verifiedAt: row.verified_at,
    lastTotpCounter: row.last_totp_counter === null
        ? null
        : Number(row.last_totp_counter),
});

export class MfaRepository {
    async findSettings(userId: string): Promise<MfaSettings | null> {
        const result = await database.query<MfaSettingsRow>(
            `SELECT enabled, secret_encrypted, pending_secret_encrypted,
                    recovery_code_hashes, verified_at, last_totp_counter
             FROM user_mfa_settings
             WHERE user_id = $1`,
            [userId],
        );
        return result.rows[0] ? mapSettings(result.rows[0]) : null;
    }

    async beginSetup(
        context: AuthenticationContext,
        pendingSecretEncrypted: string,
    ): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `INSERT INTO user_mfa_settings (
                    user_id, company_id, pending_secret_encrypted
                 ) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id) DO UPDATE
                 SET pending_secret_encrypted = EXCLUDED.pending_secret_encrypted,
                     company_id = EXCLUDED.company_id`,
                [context.userId, context.companyId, pendingSecretEncrypted],
            );
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, request_id
                 ) VALUES ($1, $2, 'auth.mfa.setup_started', 'user', $2, $3)`,
                [context.companyId, context.userId, context.sessionId],
            );
            await client.query("COMMIT");
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async confirmSetup(
        context: AuthenticationContext,
        recoveryCodeHashes: string[],
        totpCounter: number,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ user_id: string }>(
                `UPDATE user_mfa_settings
                 SET enabled = TRUE,
                     secret_encrypted = pending_secret_encrypted,
                     pending_secret_encrypted = NULL,
                     recovery_code_hashes = $3::TEXT[],
                     last_totp_counter = $4,
                     verified_at = NOW()
                 WHERE user_id = $1
                   AND company_id = $2
                   AND pending_secret_encrypted IS NOT NULL
                 RETURNING user_id`,
                [context.userId, context.companyId, recoveryCodeHashes, totpCounter],
            );
            if (!result.rows[0]) {
                await client.query("ROLLBACK");
                return false;
            }
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, request_id
                 ) VALUES ($1, $2, 'auth.mfa.enabled', 'user', $2, $3)`,
                [context.companyId, context.userId, context.sessionId],
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

    async createLoginChallenge(
        userId: string,
        companyId: string,
        tokenHash: string,
        expiresAt: Date,
        metadata: SessionMetadata,
    ): Promise<void> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            await client.query(
                `UPDATE mfa_login_challenges
                 SET used_at = COALESCE(used_at, NOW())
                 WHERE user_id = $1 AND used_at IS NULL`,
                [userId],
            );
            await client.query(
                `INSERT INTO mfa_login_challenges (
                    company_id, user_id, token_hash, expires_at
                 ) VALUES ($1, $2, $3, $4)`,
                [companyId, userId, tokenHash, expiresAt],
            );
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, context
                 ) VALUES (
                    $1, $2, 'auth.mfa.challenge_created', 'user', $2,
                    jsonb_build_object('ipAddress', $3::TEXT, 'userAgent', $4::TEXT)
                 )`,
                [
                    companyId,
                    userId,
                    metadata.ipAddress ?? null,
                    metadata.userAgent ?? null,
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

    async findLoginChallenge(
        tokenHash: string,
        maximumAttempts: number,
    ): Promise<MfaLoginChallenge | null> {
        const result = await database.query<MfaLoginChallengeRow>(
            `SELECT
                mfa_login_challenges.id,
                users.id AS user_id,
                employees.id AS employee_id,
                employees.company_id,
                employees.employee_code,
                employees.full_name,
                employees.email,
                user_mfa_settings.secret_encrypted,
                user_mfa_settings.recovery_code_hashes,
                user_mfa_settings.last_totp_counter
             FROM mfa_login_challenges
             INNER JOIN users ON users.id = mfa_login_challenges.user_id
             INNER JOIN employees ON employees.id = users.employee_id
             INNER JOIN companies ON companies.id = employees.company_id
             INNER JOIN user_mfa_settings
                ON user_mfa_settings.user_id = users.id
             WHERE mfa_login_challenges.token_hash = $1
               AND mfa_login_challenges.used_at IS NULL
               AND mfa_login_challenges.expires_at > NOW()
               AND mfa_login_challenges.attempts < $2
               AND user_mfa_settings.enabled = TRUE
               AND user_mfa_settings.secret_encrypted IS NOT NULL
               AND users.status = 'active'
               AND users.deleted_at IS NULL
               AND employees.status = 'active'
               AND employees.deleted_at IS NULL
               AND companies.active = TRUE
               AND companies.deleted_at IS NULL
             LIMIT 1`,
            [tokenHash, maximumAttempts],
        );
        const row = result.rows[0];
        if (!row) return null;
        return {
            id: row.id,
            userId: row.user_id,
            employeeId: row.employee_id,
            companyId: row.company_id,
            employeeCode: row.employee_code,
            fullName: row.full_name,
            email: row.email,
            secretEncrypted: row.secret_encrypted,
            recoveryCodeHashes: row.recovery_code_hashes,
            lastTotpCounter: row.last_totp_counter === null
                ? null
                : Number(row.last_totp_counter),
        };
    }

    async recordFailedChallenge(challengeId: string): Promise<void> {
        await database.query(
            `UPDATE mfa_login_challenges
             SET attempts = attempts + 1
             WHERE id = $1 AND used_at IS NULL`,
            [challengeId],
        );
    }

    async consumeChallenge(
        challenge: MfaLoginChallenge,
        recoveryCodeHash?: string,
        totpCounter?: number,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const consumed = await client.query<{ id: string }>(
                `UPDATE mfa_login_challenges
                 SET used_at = NOW()
                 WHERE id = $1 AND user_id = $2
                   AND used_at IS NULL AND expires_at > NOW()
                 RETURNING id`,
                [challenge.id, challenge.userId],
            );
            if (!consumed.rows[0]) {
                await client.query("ROLLBACK");
                return false;
            }
            if (totpCounter !== undefined) {
                const counter = await client.query<{ user_id: string }>(
                    `UPDATE user_mfa_settings
                     SET last_totp_counter = $2
                     WHERE user_id = $1
                       AND (
                           last_totp_counter IS NULL
                           OR last_totp_counter < $2
                       )
                     RETURNING user_id`,
                    [challenge.userId, totpCounter],
                );
                if (!counter.rows[0]) {
                    await client.query("ROLLBACK");
                    return false;
                }
            }
            if (recoveryCodeHash) {
                const recovery = await client.query<{ user_id: string }>(
                    `UPDATE user_mfa_settings
                     SET recovery_code_hashes = ARRAY_REMOVE(
                         recovery_code_hashes,
                         $2
                     )
                     WHERE user_id = $1
                       AND $2 = ANY(recovery_code_hashes)
                     RETURNING user_id`,
                    [challenge.userId, recoveryCodeHash],
                );
                if (!recovery.rows[0]) {
                    await client.query("ROLLBACK");
                    return false;
                }
            }
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, context
                 ) VALUES (
                    $1, $2, 'auth.mfa.challenge_completed', 'user', $2,
                    jsonb_build_object('usedRecoveryCode', $3::BOOLEAN)
                 )`,
                [challenge.companyId, challenge.userId, Boolean(recoveryCodeHash)],
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

    async findPasswordHash(userId: string): Promise<string | null> {
        const result = await database.query<{ password_hash: string }>(
            `SELECT password_hash FROM users
             WHERE id = $1 AND deleted_at IS NULL`,
            [userId],
        );
        return result.rows[0]?.password_hash ?? null;
    }

    async disable(
        context: AuthenticationContext,
    ): Promise<boolean> {
        const client = await database.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<{ user_id: string }>(
                `UPDATE user_mfa_settings
                 SET enabled = FALSE,
                     secret_encrypted = NULL,
                     pending_secret_encrypted = NULL,
                     recovery_code_hashes = ARRAY[]::TEXT[],
                     verified_at = NULL
                 WHERE user_id = $1 AND company_id = $2 AND enabled = TRUE
                 RETURNING user_id`,
                [context.userId, context.companyId],
            );
            if (!result.rows[0]) {
                await client.query("ROLLBACK");
                return false;
            }
            await client.query(
                "DELETE FROM mfa_login_challenges WHERE user_id = $1",
                [context.userId],
            );
            await client.query(
                `UPDATE sessions
                 SET revoked_at = COALESCE(revoked_at, NOW()),
                     revocation_reason = COALESCE(
                         revocation_reason,
                         'mfa_disabled'
                     )
                 WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`,
                [context.userId, context.sessionId],
            );
            await client.query(
                `INSERT INTO audit_logs (
                    company_id, actor_user_id, event, entity_type, entity_id, request_id
                 ) VALUES ($1, $2, 'auth.mfa.disabled', 'user', $2, $3)`,
                [context.companyId, context.userId, context.sessionId],
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
}

export const mfaRepository = new MfaRepository();
