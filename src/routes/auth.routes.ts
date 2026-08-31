import { Router } from "express";
import { login, logout, logoutAll, me, refresh } from "../controllers/auth.controller.js";
import {
    beginMfaSetup,
    confirmMfaSetup,
    disableMfa,
    getMfaStatus,
    verifyMfaLogin,
} from "../controllers/mfa.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
    loginRateLimiter,
    mfaRateLimiter,
    refreshRateLimiter,
} from "../middlewares/security.middleware.js";

const authRoutes = Router();

authRoutes.post("/login", loginRateLimiter, login);
authRoutes.post("/refresh", refreshRateLimiter, refresh);
authRoutes.post("/mfa/verify", mfaRateLimiter, verifyMfaLogin);
authRoutes.get("/mfa", authenticate, getMfaStatus);
authRoutes.post("/mfa/setup", authenticate, mfaRateLimiter, beginMfaSetup);
authRoutes.post("/mfa/confirm", authenticate, mfaRateLimiter, confirmMfaSetup);
authRoutes.delete("/mfa", authenticate, mfaRateLimiter, disableMfa);
authRoutes.post("/logout", authenticate, logout);
authRoutes.post("/logout-all", authenticate, logoutAll);
authRoutes.get("/me", authenticate, me);

export default authRoutes;
