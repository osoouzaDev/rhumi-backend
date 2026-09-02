import multer from "multer";
import { env } from "../config/env.js";

export const uploadSinglePrivateFile = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 1,
        fileSize: env.FILE_MAX_BYTES,
        fields: 5,
        fieldSize: 10_000,
    },
}).single("file");
