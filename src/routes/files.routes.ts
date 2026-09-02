import { Router } from "express";
import {
    createPrivateFileLink,
    deletePrivateFile,
    downloadPrivateFile,
    downloadSharedFile,
    getPrivateFile,
    listPrivateFiles,
    uploadPrivateFile,
} from "../controllers/files.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import { uploadSinglePrivateFile } from "../middlewares/file-upload.middleware.js";
import { authorizeAny } from "../middlewares/permission.middleware.js";

const filesRoutes = Router();

filesRoutes.get("/shared/:token", downloadSharedFile);
filesRoutes.use(authenticate);
filesRoutes.get(
    "/",
    authorizeAny("files.self.read", "files.read", "files.manage"),
    listPrivateFiles,
);
filesRoutes.post(
    "/",
    authorizeAny("files.upload", "files.manage"),
    uploadSinglePrivateFile,
    uploadPrivateFile,
);
filesRoutes.get(
    "/:id",
    authorizeAny("files.self.read", "files.read", "files.manage"),
    getPrivateFile,
);
filesRoutes.get(
    "/:id/download",
    authorizeAny("files.self.read", "files.read", "files.manage"),
    downloadPrivateFile,
);
filesRoutes.post(
    "/:id/links",
    authorizeAny("files.self.read", "files.read", "files.manage"),
    createPrivateFileLink,
);
filesRoutes.delete(
    "/:id",
    authorizeAny("files.upload", "files.manage"),
    deletePrivateFile,
);

export default filesRoutes;
