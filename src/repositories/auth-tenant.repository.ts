import database from "../database/connection.js";

interface CompanyResolutionRow {
    company_id: string | null;
}

export class AuthTenantRepository {
    async resolveLoginCompany(identifier: string): Promise<string | null> {
        const result = await database.query<CompanyResolutionRow>(
            "SELECT rhumi_resolve_login_company($1) AS company_id",
            [identifier],
        );
        return result.rows[0]?.company_id ?? null;
    }

    async resolveRefreshCompany(refreshTokenHash: string): Promise<string | null> {
        const result = await database.query<CompanyResolutionRow>(
            "SELECT rhumi_resolve_refresh_company($1) AS company_id",
            [refreshTokenHash],
        );
        return result.rows[0]?.company_id ?? null;
    }

    async resolveMfaChallengeCompany(challengeHash: string): Promise<string | null> {
        const result = await database.query<CompanyResolutionRow>(
            "SELECT rhumi_resolve_mfa_challenge_company($1) AS company_id",
            [challengeHash],
        );
        return result.rows[0]?.company_id ?? null;
    }
}

export const authTenantRepository = new AuthTenantRepository();
