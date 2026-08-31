import { Router } from "express";
import {
    archiveCandidate,
    archiveVacancy,
    createApplication,
    createCandidate,
    createVacancy,
    getApplication,
    getCandidate,
    getVacancy,
    getVacancyBoard,
    listApplications,
    listCandidates,
    listVacancies,
    updateApplication,
    updateCandidate,
    updateVacancy,
    withdrawApplication,
} from "../controllers/recruitment.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const recruitmentRoutes = Router();

recruitmentRoutes.use(authenticate, authorize("recruitment.manage"));

recruitmentRoutes.get("/vacancies", listVacancies);
recruitmentRoutes.post("/vacancies", createVacancy);
recruitmentRoutes.get("/vacancies/:id/board", getVacancyBoard);
recruitmentRoutes.post("/vacancies/:id/applications", createApplication);
recruitmentRoutes.get("/vacancies/:id", getVacancy);
recruitmentRoutes.patch("/vacancies/:id", updateVacancy);
recruitmentRoutes.delete("/vacancies/:id", archiveVacancy);

recruitmentRoutes.get("/candidates", listCandidates);
recruitmentRoutes.post("/candidates", createCandidate);
recruitmentRoutes.get("/candidates/:id", getCandidate);
recruitmentRoutes.patch("/candidates/:id", updateCandidate);
recruitmentRoutes.delete("/candidates/:id", archiveCandidate);

recruitmentRoutes.get("/applications", listApplications);
recruitmentRoutes.get("/applications/:id", getApplication);
recruitmentRoutes.patch("/applications/:id", updateApplication);
recruitmentRoutes.delete("/applications/:id", withdrawApplication);

export default recruitmentRoutes;
