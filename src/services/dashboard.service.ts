import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    calendarRepository,
    type CalendarDashboardMetrics,
} from "../repositories/calendar.repository.js";
import {
    dashboardRepository,
    type DashboardData,
} from "../repositories/dashboard.repository.js";
import {
    developmentPlansRepository,
    type DevelopmentDashboardMetrics,
} from "../repositories/development-plans.repository.js";
import {
    evaluationAssignmentsRepository,
    type EvaluationDashboardMetrics,
} from "../repositories/evaluation-assignments.repository.js";
import {
    journeyAssignmentsRepository,
    type JourneyDashboardMetrics,
} from "../repositories/journey-assignments.repository.js";
import {
    notificationsRepository,
    type NotificationDashboardMetrics,
} from "../repositories/notifications.repository.js";
import {
    recruitmentDashboardRepository,
    type RecruitmentMetrics,
} from "../repositories/recruitment-dashboard.repository.js";
import {
    trainingsRepository,
    type TrainingDashboardMetrics,
} from "../repositories/trainings.repository.js";

export interface DashboardResult extends DashboardData {
    recruitment: RecruitmentMetrics;
    calendar: CalendarDashboardMetrics;
    trainings: TrainingDashboardMetrics;
    journeys: JourneyDashboardMetrics;
    evaluations: EvaluationDashboardMetrics;
    development: DevelopmentDashboardMetrics;
    notifications: NotificationDashboardMetrics;
    scope: {
        type: "company" | "department";
        companyId: string;
        departmentId?: string;
    };
    generatedAt: string;
}

export class DashboardService {
    async getDashboard(context: AuthenticationContext): Promise<DashboardResult> {
        const hasCompanyScope = context.roles.includes("administrator");
        const departmentId = hasCompanyScope ? undefined : context.departmentId;
        const [
            dashboard, recruitment, calendar, trainings, journeys,
            evaluations, development, notifications,
        ] = await Promise.all([
            dashboardRepository.getDashboard(context.companyId, departmentId),
            recruitmentDashboardRepository.getMetrics(context.companyId, departmentId),
            calendarRepository.getDashboardMetrics(context),
            trainingsRepository.getDashboardMetrics(context),
            journeyAssignmentsRepository.getDashboardMetrics(context),
            evaluationAssignmentsRepository.getDashboardMetrics(context),
            developmentPlansRepository.getDashboardMetrics(context),
            notificationsRepository.getDashboardMetrics(context),
        ]);

        return {
            ...dashboard,
            recruitment,
            calendar,
            trainings,
            journeys,
            evaluations,
            development,
            notifications,
            scope: {
                type: hasCompanyScope ? "company" : "department",
                companyId: context.companyId,
                ...(departmentId ? { departmentId } : {}),
            },
            generatedAt: new Date().toISOString(),
        };
    }
}

export const dashboardService = new DashboardService();
