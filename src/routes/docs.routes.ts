import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiDocument } from "../docs/openapi.js";

const docsRoutes = Router();

docsRoutes.use((_request, response, next) => {
    response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; style-src 'self' 'unsafe-inline'; "
        + "script-src 'self' 'unsafe-inline'; img-src 'self' data:",
    );
    next();
});
docsRoutes.get("/openapi.json", (_request, response) => response.json(openApiDocument));
docsRoutes.use(
    "/",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
        customSiteTitle: "RHumi API",
        swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
);

export default docsRoutes;
