import type { Request } from "express";

export const readCookie = (request: Request, name: string): string | undefined => {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) {
        return undefined;
    }

    for (const part of cookieHeader.split(";")) {
        const separatorIndex = part.indexOf("=");
        if (separatorIndex < 1) {
            continue;
        }

        const key = part.slice(0, separatorIndex).trim();
        if (key !== name) {
            continue;
        }

        const value = part.slice(separatorIndex + 1).trim();
        try {
            return decodeURIComponent(value);
        } catch {
            return value;
        }
    }

    return undefined;
};
