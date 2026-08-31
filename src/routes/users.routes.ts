import { Router } from "express";
import {
    archiveUser,
    createUser,
    getUser,
    listPermissions,
    listRoles,
    listUsers,
    updateUser,
} from "../controllers/users.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const usersRoutes = Router();

usersRoutes.use(authenticate);
usersRoutes.get("/roles", authorize("users.list"), listRoles);
usersRoutes.get("/permissions", authorize("users.list"), listPermissions);
usersRoutes.get("/", authorize("users.list"), listUsers);
usersRoutes.get("/:id", authorize("users.list"), getUser);
usersRoutes.post("/", authorize("users.create"), createUser);
usersRoutes.patch("/:id", authorize("users.update"), updateUser);
usersRoutes.delete("/:id", authorize("users.delete"), archiveUser);

export default usersRoutes;
