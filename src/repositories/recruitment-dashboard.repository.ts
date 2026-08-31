import database from "../database/connection.js";

export interface RecruitmentMetrics {
    openVacancies: number;
    activeApplications: number;
    candidates: number;
    hiresLast30Days: number;
    applicationsByStage: {
        applied: number;
        screening: number;
        interview: number;
        assessment: number;
        offer: number;
        hired: number;
        rejected: number;
    };
}

interface RecruitmentMetricsRow {
    open_vacancies: number;
    active_applications: number;
    candidates: number;
    hires_last_30_days: number;
    applied: number;
    screening: number;
    interview: number;
    assessment: number;
    offer: number;
    hired: number;
    rejected: number;
}

export class RecruitmentDashboardRepository {
    async getMetrics(
        companyId: string,
        scopeDepartmentId?: string,
    ): Promise<RecruitmentMetrics> {
        const result = await database.query<RecruitmentMetricsRow>(
            `SELECT
                (SELECT COUNT(*)::INTEGER
                 FROM vacancies
                 WHERE company_id = $1 AND status = 'open' AND deleted_at IS NULL
                   AND ($2::UUID IS NULL OR department_id = $2)) AS open_vacancies,
                COUNT(job_applications.id) FILTER (
                    WHERE job_applications.status = 'active'
                      AND job_applications.stage NOT IN ('hired', 'rejected')
                )::INTEGER AS active_applications,
                (SELECT COUNT(*)::INTEGER
                 FROM candidates
                 WHERE candidates.company_id = $1 AND candidates.deleted_at IS NULL
                  AND ($2::UUID IS NULL OR EXISTS (
                      SELECT 1
                      FROM job_applications AS scoped_applications
                      INNER JOIN vacancies AS scoped_vacancies
                          ON scoped_vacancies.id = scoped_applications.vacancy_id
                      WHERE scoped_applications.candidate_id = candidates.id
                        AND scoped_applications.deleted_at IS NULL
                        AND scoped_vacancies.department_id = $2
                  ))) AS candidates,
                COUNT(job_applications.id) FILTER (
                    WHERE job_applications.stage = 'hired'
                      AND job_applications.hired_at >= NOW() - INTERVAL '30 days'
                )::INTEGER AS hires_last_30_days,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'applied')::INTEGER AS applied,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'screening')::INTEGER AS screening,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'interview')::INTEGER AS interview,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'assessment')::INTEGER AS assessment,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'offer')::INTEGER AS offer,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'hired')::INTEGER AS hired,
                COUNT(job_applications.id) FILTER (WHERE job_applications.stage = 'rejected')::INTEGER AS rejected
             FROM job_applications
             INNER JOIN vacancies ON vacancies.id = job_applications.vacancy_id
             WHERE job_applications.company_id = $1
               AND job_applications.deleted_at IS NULL
               AND vacancies.deleted_at IS NULL
               AND ($2::UUID IS NULL OR vacancies.department_id = $2)`,
            [companyId, scopeDepartmentId ?? null],
        );
        const row = result.rows[0];
        return {
            openVacancies: row.open_vacancies,
            activeApplications: row.active_applications,
            candidates: row.candidates,
            hiresLast30Days: row.hires_last_30_days,
            applicationsByStage: {
                applied: row.applied,
                screening: row.screening,
                interview: row.interview,
                assessment: row.assessment,
                offer: row.offer,
                hired: row.hired,
                rejected: row.rejected,
            },
        };
    }
}

export const recruitmentDashboardRepository = new RecruitmentDashboardRepository();
