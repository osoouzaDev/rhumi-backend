import { Router } from "express";
import {
    archiveEvaluationCycle,
    archivePerformanceGoal,
    assignEvaluationParticipants,
    cancelEvaluationAssignment,
    completeEvaluationFeedback,
    createEvaluationCycle,
    createPerformanceGoal,
    getEvaluationAssignment,
    getEvaluationCycle,
    getMyEvaluation,
    listEvaluationAssignments,
    listEvaluationCycles,
    listMyEvaluations,
    scheduleEvaluationFeedback,
    submitManagerReview,
    submitMySelfReview,
    updateEvaluationCycle,
    updateMyPerformanceGoal,
    updatePerformanceGoal,
} from "../controllers/evaluations.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const evaluationsRoutes = Router();
evaluationsRoutes.use(authenticate);

evaluationsRoutes.get("/me", authorize("evaluations.self.respond"), listMyEvaluations);
evaluationsRoutes.get("/me/:id", authorize("evaluations.self.respond"), getMyEvaluation);
evaluationsRoutes.post(
    "/me/:id/self-review", authorize("evaluations.self.respond"), submitMySelfReview,
);
evaluationsRoutes.patch(
    "/me/:id/goals/:goalId", authorize("evaluations.self.respond"), updateMyPerformanceGoal,
);

evaluationsRoutes.get("/cycles", authorize("evaluations.manage"), listEvaluationCycles);
evaluationsRoutes.post("/cycles", authorize("evaluations.manage"), createEvaluationCycle);
evaluationsRoutes.post(
    "/cycles/:id/participants", authorize("evaluations.manage"), assignEvaluationParticipants,
);
evaluationsRoutes.get("/cycles/:id", authorize("evaluations.manage"), getEvaluationCycle);
evaluationsRoutes.patch("/cycles/:id", authorize("evaluations.manage"), updateEvaluationCycle);
evaluationsRoutes.delete("/cycles/:id", authorize("evaluations.manage"), archiveEvaluationCycle);

evaluationsRoutes.get("/assignments", authorize("evaluations.manage"), listEvaluationAssignments);
evaluationsRoutes.get("/assignments/:id", authorize("evaluations.manage"), getEvaluationAssignment);
evaluationsRoutes.delete(
    "/assignments/:id", authorize("evaluations.manage"), cancelEvaluationAssignment,
);
evaluationsRoutes.post(
    "/assignments/:id/manager-review", authorize("evaluations.manage"), submitManagerReview,
);
evaluationsRoutes.put(
    "/assignments/:id/feedback", authorize("evaluations.manage"), scheduleEvaluationFeedback,
);
evaluationsRoutes.post(
    "/assignments/:id/feedback/complete", authorize("evaluations.manage"),
    completeEvaluationFeedback,
);
evaluationsRoutes.post(
    "/assignments/:id/goals", authorize("evaluations.manage"), createPerformanceGoal,
);
evaluationsRoutes.patch(
    "/assignments/:id/goals/:goalId", authorize("evaluations.manage"), updatePerformanceGoal,
);
evaluationsRoutes.delete(
    "/assignments/:id/goals/:goalId", authorize("evaluations.manage"), archivePerformanceGoal,
);

export default evaluationsRoutes;
