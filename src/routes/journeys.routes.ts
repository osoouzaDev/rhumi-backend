import { Router } from "express";
import {
    archiveJourneyTemplate,
    cancelJourneyAssignment,
    createJourneyAssignment,
    createJourneyTemplate,
    getJourneyAssignment,
    getJourneyTemplate,
    getMyJourney,
    listJourneyAssignments,
    listJourneyTemplates,
    listMyJourneys,
    updateJourneyAssignment,
    updateJourneyTask,
    updateJourneyTemplate,
    updateMyJourneyTask,
} from "../controllers/journeys.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const journeysRoutes = Router();
journeysRoutes.use(authenticate);

journeysRoutes.get("/me", authorize("journeys.self.read"), listMyJourneys);
journeysRoutes.get("/me/:id", authorize("journeys.self.read"), getMyJourney);
journeysRoutes.patch(
    "/me/:id/tasks/:taskId", authorize("journeys.self.read"), updateMyJourneyTask,
);

journeysRoutes.get("/templates", authorize("journeys.manage"), listJourneyTemplates);
journeysRoutes.post("/templates", authorize("journeys.manage"), createJourneyTemplate);
journeysRoutes.get("/templates/:id", authorize("journeys.manage"), getJourneyTemplate);
journeysRoutes.patch("/templates/:id", authorize("journeys.manage"), updateJourneyTemplate);
journeysRoutes.delete("/templates/:id", authorize("journeys.manage"), archiveJourneyTemplate);

journeysRoutes.get("/assignments", authorize("journeys.manage"), listJourneyAssignments);
journeysRoutes.post("/assignments", authorize("journeys.manage"), createJourneyAssignment);
journeysRoutes.get("/assignments/:id", authorize("journeys.manage"), getJourneyAssignment);
journeysRoutes.patch("/assignments/:id", authorize("journeys.manage"), updateJourneyAssignment);
journeysRoutes.delete("/assignments/:id", authorize("journeys.manage"), cancelJourneyAssignment);
journeysRoutes.patch(
    "/assignments/:id/tasks/:taskId", authorize("journeys.manage"), updateJourneyTask,
);

export default journeysRoutes;
