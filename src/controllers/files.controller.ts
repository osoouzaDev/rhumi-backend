import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createFileLinkSchema,
    fileListQuerySchema,
    fileTokenParameterSchema,
    uploadFileFieldsSchema,
} from "../schemas/files.schemas.js";
import { filesService } from "../services/files.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const publicFile = (file: Awaited<ReturnType<typeof filesService.get>>) => ({
    id: file.id,
    ownerEmployeeId: file.ownerEmployeeId,
    purpose: file.purpose,
    originalName: file.originalName,
    mimeType: file.mimeType,
    byteSize: file.byteSize,
    sha256: file.sha256,
    scanStatus: file.scanStatus,
    retentionUntil: file.retentionUntil,
    createdAt: file.createdAt,
});

const sendDownload = (
    response: Response,
    result: Awaited<ReturnType<typeof filesService.download>>,
): void => {
    const asciiName = result.file.originalName
        .replace(/[^\x20-\x7e]/g, "_")
        .replaceAll('"', "'");
    response.set({
        "Content-Type": result.file.mimeType,
        "Content-Length": String(result.content.length),
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(result.file.originalName)}`,
        "X-Content-Type-Options": "nosniff",
    });
    response.send(result.content);
};

export const uploadPrivateFile = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const fields = uploadFileFieldsSchema.parse(request.body);
    const file = await filesService.upload(context, request.file, fields, getAuditActor(request));
    response.status(201).json({ data: { file: publicFile(file) } });
};

export const listPrivateFiles = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = fileListQuerySchema.parse(request.query);
    const result = await filesService.list(context, query);
    response.json({
        data: { files: result.items.map(publicFile) },
        meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / query.pageSize),
        },
    });
};

export const getPrivateFile = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    response.json({ data: { file: publicFile(await filesService.get(context, id)) } });
};

export const downloadPrivateFile = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    sendDownload(response, await filesService.download(context, id));
};

export const createPrivateFileLink = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = createFileLinkSchema.parse(request.body);
    const link = await filesService.createTemporaryLink(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { link } });
};

export const downloadSharedFile = async (request: Request, response: Response): Promise<void> => {
    const { token } = fileTokenParameterSchema.parse(request.params);
    sendDownload(response, await filesService.downloadShared(token));
};

export const deletePrivateFile = async (request: Request, response: Response): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await filesService.archive(context, id, getAuditActor(request));
    response.status(204).send();
};
