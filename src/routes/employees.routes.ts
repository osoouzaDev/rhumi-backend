import { Router } from "express";
import {
    archiveEmployee,
    createEmployee,
    getEmployee,
    getOwnEmployeeProfile,
    listEmployees,
    updateEmployee,
} from "../controllers/employees.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { authorizeAny } from "../middlewares/permission.middleware.js";

const employeesRoutes = Router();

employeesRoutes.use(authenticate);
employeesRoutes.get("/", authorize("employees.list"), listEmployees);
employeesRoutes.get(
    "/me",
    authorizeAny("employees.self.read", "employees.read"),
    getOwnEmployeeProfile,
);
employeesRoutes.get("/:id", authorize("employees.read"), getEmployee);
employeesRoutes.post("/", authorize("employees.create"), createEmployee);
employeesRoutes.patch("/:id", authorize("employees.update"), updateEmployee);
employeesRoutes.delete("/:id", authorize("employees.delete"), archiveEmployee);

export default employeesRoutes;
