import { Router } from "express";
import {
    archivePosition,
    createPosition,
    getPosition,
    listPositions,
    updatePosition,
} from "../controllers/positions.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const positionsRoutes = Router();

positionsRoutes.use(authenticate);
positionsRoutes.get("/", authorize("positions.list"), listPositions);
positionsRoutes.get("/:id", authorize("positions.list"), getPosition);
positionsRoutes.post("/", authorize("positions.create"), createPosition);
positionsRoutes.patch("/:id", authorize("positions.update"), updatePosition);
positionsRoutes.delete("/:id", authorize("positions.delete"), archivePosition);

export default positionsRoutes;
