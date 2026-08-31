import { Router } from "express";
import {
    archiveCareerTrack,
    cancelDevelopmentPlan,
    createCareerTrack,
    createDevelopmentPlan,
    getCareerProfile,
    getCareerTrack,
    getDevelopmentPlan,
    getMyCareer,
    getMyDevelopmentPlan,
    listCareerTracks,
    listDevelopmentPlans,
    listMyDevelopmentPlans,
    updateCareerTrack,
    updateDevelopmentAction,
    updateDevelopmentPlan,
    updateMyDevelopmentAction,
    upsertCareerProfile,
} from "../controllers/development.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const developmentRoutes = Router();
developmentRoutes.use(authenticate);

developmentRoutes.get("/me/career", authorize("development.self.read"), getMyCareer);
developmentRoutes.get("/me/plans", authorize("development.self.read"), listMyDevelopmentPlans);
developmentRoutes.get("/me/plans/:id", authorize("development.self.read"), getMyDevelopmentPlan);
developmentRoutes.patch(
    "/me/plans/:id/actions/:actionId",
    authorize("development.self.read"),
    updateMyDevelopmentAction,
);

developmentRoutes.get("/career-tracks", authorize("development.manage"), listCareerTracks);
developmentRoutes.post("/career-tracks", authorize("development.manage"), createCareerTrack);
developmentRoutes.get("/career-tracks/:id", authorize("development.manage"), getCareerTrack);
developmentRoutes.patch("/career-tracks/:id", authorize("development.manage"), updateCareerTrack);
developmentRoutes.delete("/career-tracks/:id", authorize("development.manage"), archiveCareerTrack);

developmentRoutes.get(
    "/career-profiles/:employeeId", authorize("development.manage"), getCareerProfile,
);
developmentRoutes.put(
    "/career-profiles/:employeeId", authorize("development.manage"), upsertCareerProfile,
);

developmentRoutes.get("/plans", authorize("development.manage"), listDevelopmentPlans);
developmentRoutes.post("/plans", authorize("development.manage"), createDevelopmentPlan);
developmentRoutes.get("/plans/:id", authorize("development.manage"), getDevelopmentPlan);
developmentRoutes.patch("/plans/:id", authorize("development.manage"), updateDevelopmentPlan);
developmentRoutes.delete("/plans/:id", authorize("development.manage"), cancelDevelopmentPlan);
developmentRoutes.patch(
    "/plans/:id/actions/:actionId", authorize("development.manage"), updateDevelopmentAction,
);

export default developmentRoutes;
