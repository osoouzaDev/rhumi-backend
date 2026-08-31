import { Router } from "express";
import {
    archiveDepartment,
    createDepartment,
    getDepartment,
    listDepartments,
    updateDepartment,
} from "../controllers/departments.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const departmentsRoutes = Router();

departmentsRoutes.use(authenticate);
departmentsRoutes.get("/", authorize("departments.list"), listDepartments);
departmentsRoutes.get("/:id", authorize("departments.list"), getDepartment);
departmentsRoutes.post("/", authorize("departments.create"), createDepartment);
departmentsRoutes.patch("/:id", authorize("departments.update"), updateDepartment);
departmentsRoutes.delete("/:id", authorize("departments.delete"), archiveDepartment);

export default departmentsRoutes;
