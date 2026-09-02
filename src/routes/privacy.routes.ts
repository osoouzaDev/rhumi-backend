import { Router } from "express";
import {
    createOwnPrivacyRequest,
    listOwnConsents,
    listPrivacyRequests,
    processPrivacyRequest,
    recordOwnConsent,
} from "../controllers/privacy.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import { authorizeAny } from "../middlewares/permission.middleware.js";

const privacyRoutes = Router();
privacyRoutes.use(authenticate);

privacyRoutes.get("/me/consents", authorize("privacy.self"), listOwnConsents);
privacyRoutes.post("/me/consents", authorize("privacy.self"), recordOwnConsent);
privacyRoutes.get(
    "/me/requests",
    authorizeAny("privacy.self", "privacy.read", "privacy.manage"),
    listPrivacyRequests,
);
privacyRoutes.post("/me/requests", authorize("privacy.self"), createOwnPrivacyRequest);
privacyRoutes.get(
    "/requests",
    authorizeAny("privacy.read", "privacy.manage"),
    listPrivacyRequests,
);
privacyRoutes.patch("/requests/:id", authorize("privacy.manage"), processPrivacyRequest);

export default privacyRoutes;
