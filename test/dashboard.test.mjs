import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import app from "../dist/app.js";
import { calendarRepository } from "../dist/repositories/calendar.repository.js";
import { dashboardRepository } from "../dist/repositories/dashboard.repository.js";
import { developmentPlansRepository } from "../dist/repositories/development-plans.repository.js";
import { evaluationAssignmentsRepository } from "../dist/repositories/evaluation-assignments.repository.js";
import { journeyAssignmentsRepository } from "../dist/repositories/journey-assignments.repository.js";
import { notificationsRepository } from "../dist/repositories/notifications.repository.js";
import { recruitmentDashboardRepository } from "../dist/repositories/recruitment-dashboard.repository.js";
import { trainingsRepository } from "../dist/repositories/trainings.repository.js";
import { DashboardService } from "../dist/services/dashboard.service.js";

const emptyDashboard = {
    employees: { total: 0, active: 0, onLeave: 0, inactive: 0, admittedLast30Days: 0 },
    organization: { activeDepartments: 0, activePositions: 0 },
    accounts: { active: 0, blocked: 0, inactive: 0, withoutAccount: 0 },
    headcountByDepartment: [], contractDistribution: [], recentHires: [],
};

test("aplica escopo de empresa ao administrador e de setor aos demais perfis", async () => {
    const original = dashboardRepository.getDashboard;
    const originalRecruitment = recruitmentDashboardRepository.getMetrics;
    const originalCalendar = calendarRepository.getDashboardMetrics;
    const originalTrainings = trainingsRepository.getDashboardMetrics;
    const originalJourneys = journeyAssignmentsRepository.getDashboardMetrics;
    const originalEvaluations = evaluationAssignmentsRepository.getDashboardMetrics;
    const originalDevelopment = developmentPlansRepository.getDashboardMetrics;
    const originalNotifications = notificationsRepository.getDashboardMetrics;
    const calls = [];
    dashboardRepository.getDashboard = async (companyId, departmentId) => {
        calls.push({ companyId, departmentId }); return emptyDashboard;
    };
    calendarRepository.getDashboardMetrics = async () => ({
        todayEvents: 0, nextSevenDays: 0, pendingResponses: 0,
    });
    trainingsRepository.getDashboardMetrics = async () => ({
        publishedTrainings: 0, activeClasses: 0, myPendingTrainings: 0, completionRate: 0,
    });
    journeyAssignmentsRepository.getDashboardMetrics = async () => ({
        activeJourneys: 0, overdueJourneys: 0, myActiveJourneys: 0, myPendingTasks: 0,
    });
    evaluationAssignmentsRepository.getDashboardMetrics = async () => ({
        activeCycles: 0, myPendingReviews: 0, awaitingManagerReview: 0, completionRate: 0,
    });
    developmentPlansRepository.getDashboardMetrics = async () => ({
        publishedCareerTracks: 0, activePlans: 0, overduePlans: 0, myPendingActions: 0,
    });
    notificationsRepository.getDashboardMetrics = async () => ({
        unreadNotifications: 0, urgentNotifications: 0,
        overdueNotifications: 0, dueTodayNotifications: 0,
    });
    recruitmentDashboardRepository.getMetrics = async () => ({
        openVacancies: 0, activeApplications: 0, candidates: 0, hiresLast30Days: 0,
        applicationsByStage: { applied: 0, screening: 0, interview: 0,
            assessment: 0, offer: 0, hired: 0, rejected: 0 },
    });

    try {
        const service = new DashboardService();
        const baseContext = {
            userId: "1", sessionId: "2", employeeId: "3", companyId: "company-1",
            departmentId: "department-1", positionId: "position-1",
            employeeCode: "COL001", fullName: "Colaborador",
            email: "colaborador@example.com", permissions: ["dashboard.read"],
        };
        const administrator = await service.getDashboard({
            ...baseContext, roles: ["administrator"],
        });
        const supervisor = await service.getDashboard({
            ...baseContext, roles: ["supervisor"],
        });
        assert.equal(administrator.scope.type, "company");
        assert.equal(calls[0].departmentId, undefined);
        assert.equal(supervisor.scope.type, "department");
        assert.equal(calls[1].departmentId, "department-1");
    } finally {
        dashboardRepository.getDashboard = original;
        recruitmentDashboardRepository.getMetrics = originalRecruitment;
        calendarRepository.getDashboardMetrics = originalCalendar;
        trainingsRepository.getDashboardMetrics = originalTrainings;
        journeyAssignmentsRepository.getDashboardMetrics = originalJourneys;
        evaluationAssignmentsRepository.getDashboardMetrics = originalEvaluations;
        developmentPlansRepository.getDashboardMetrics = originalDevelopment;
        notificationsRepository.getDashboardMetrics = originalNotifications;
    }
});

let server;
let baseUrl;

before(() => {
    server = app.listen(0);
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
}));

test("protege o dashboard sem autenticação", async () => {
    const response = await fetch(`${baseUrl}/api/v1/dashboard`);
    const payload = await response.json();
    assert.equal(response.status, 401);
    assert.equal(payload.error.code, "AUTHENTICATION_REQUIRED");
});
