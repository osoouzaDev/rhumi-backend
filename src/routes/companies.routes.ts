import { Router } from "express";
import {
    getCurrentCompany,
    updateCurrentCompany,
} from "../controllers/companies.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const companiesRoutes = Router();

companiesRoutes.use(authenticate);
companiesRoutes.get("/current", authorize("companies.read"), getCurrentCompany);
companiesRoutes.patch("/current", authorize("companies.update"), updateCurrentCompany);

export default companiesRoutes;
