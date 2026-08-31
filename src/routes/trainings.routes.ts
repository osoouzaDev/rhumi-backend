import { Router } from "express";
import {
    archiveTraining,
    archiveTrainingClass,
    assignTrainingEnrollments,
    cancelTrainingEnrollment,
    createTraining,
    createTrainingClass,
    getMyTraining,
    getMyTrainingExam,
    getTraining,
    getTrainingClass,
    getTrainingExam,
    listMyTrainings,
    listTrainingClasses,
    listTrainingEnrollments,
    listTrainings,
    submitMyTrainingExam,
    updateMyTrainingProgress,
    updateTraining,
    updateTrainingClass,
    upsertTrainingExam,
} from "../controllers/trainings.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const trainingsRoutes = Router();

trainingsRoutes.use(authenticate);

trainingsRoutes.get("/me/enrollments", authorize("trainings.self.read"), listMyTrainings);
trainingsRoutes.get("/me/enrollments/:id/exam", authorize("trainings.self.read"), getMyTrainingExam);
trainingsRoutes.post(
    "/me/enrollments/:id/attempts",
    authorize("trainings.self.read"),
    submitMyTrainingExam,
);
trainingsRoutes.patch(
    "/me/enrollments/:id/progress",
    authorize("trainings.self.read"),
    updateMyTrainingProgress,
);
trainingsRoutes.get("/me/enrollments/:id", authorize("trainings.self.read"), getMyTraining);

trainingsRoutes.get("/classes", authorize("trainings.manage"), listTrainingClasses);
trainingsRoutes.get("/classes/:id", authorize("trainings.manage"), getTrainingClass);
trainingsRoutes.patch("/classes/:id", authorize("trainings.manage"), updateTrainingClass);
trainingsRoutes.delete("/classes/:id", authorize("trainings.manage"), archiveTrainingClass);
trainingsRoutes.get(
    "/classes/:id/enrollments",
    authorize("trainings.manage"),
    listTrainingEnrollments,
);
trainingsRoutes.post(
    "/classes/:id/enrollments",
    authorize("trainings.manage"),
    assignTrainingEnrollments,
);
trainingsRoutes.delete(
    "/enrollments/:id",
    authorize("trainings.manage"),
    cancelTrainingEnrollment,
);

trainingsRoutes.get("/", authorize("trainings.manage"), listTrainings);
trainingsRoutes.post("/", authorize("trainings.manage"), createTraining);
trainingsRoutes.get("/:id/exam", authorize("trainings.manage"), getTrainingExam);
trainingsRoutes.put("/:id/exam", authorize("trainings.manage"), upsertTrainingExam);
trainingsRoutes.post("/:id/classes", authorize("trainings.manage"), createTrainingClass);
trainingsRoutes.get("/:id", authorize("trainings.manage"), getTraining);
trainingsRoutes.patch("/:id", authorize("trainings.manage"), updateTraining);
trainingsRoutes.delete("/:id", authorize("trainings.manage"), archiveTraining);

export default trainingsRoutes;
