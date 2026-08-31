import type { AuthenticationContext } from "../repositories/auth.repository.js";

declare global {
    namespace Express {
        interface Request {
            auth?: AuthenticationContext;
            requestId?: string;
        }
    }
}

export {};
