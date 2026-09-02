declare module "swagger-ui-express" {
    import type { RequestHandler } from "express";

    interface SwaggerUiOptions {
        customSiteTitle?: string;
        customCss?: string;
        swaggerOptions?: Record<string, unknown>;
    }

    const swaggerUi: {
        serve: RequestHandler[];
        setup(document: Record<string, unknown>, options?: SwaggerUiOptions): RequestHandler;
    };

    export default swaggerUi;
}
