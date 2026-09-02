import { env } from "../config/env.js";
import { runWithTenantContext } from "../database/tenant-context.js";
import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import { employeesRepository } from "../repositories/employees.repository.js";
import { filesRepository, type StoredFile } from "../repositories/files.repository.js";
import type { AuditActor } from "../repositories/organization.repository.js";
import type {
    CreateFileLinkInput,
    FileListQuery,
    UploadFileFields,
} from "../schemas/files.schemas.js";
import { createOpaqueToken, hashOpaqueToken } from "../utils/auth-tokens.js";
import { fileStorageService } from "./file-storage.service.js";

const hasAnyPermission = (context: AuthenticationContext, permissions: string[]): boolean => (
    permissions.some((permission) => context.permissions.includes(permission))
);

const canRead = (context: AuthenticationContext, file: StoredFile): boolean => (
    hasAnyPermission(context, ["files.read", "files.manage"])
    || file.ownerEmployeeId === context.employeeId
    || (file.ownerEmployeeId === null && file.uploadedByUserId === context.userId)
);

const requireReadable = (context: AuthenticationContext, file: StoredFile): void => {
    if (!canRead(context, file)) {
        throw new AppError(403, "FILE_ACCESS_DENIED", "Você não pode acessar este arquivo.");
    }
};

export class FilesService {
    async upload(
        context: AuthenticationContext,
        file: Express.Multer.File | undefined,
        fields: UploadFileFields,
        actor: AuditActor,
    ): Promise<StoredFile> {
        if (!file) {
            throw new AppError(422, "FILE_REQUIRED", "Envie um arquivo no campo file.");
        }
        const ownerEmployeeId = fields.ownerEmployeeId ?? context.employeeId;
        if (
            ownerEmployeeId !== context.employeeId
            && !hasAnyPermission(context, ["files.manage"])
        ) {
            throw new AppError(
                403,
                "FILE_OWNER_ASSIGNMENT_DENIED",
                "Você não pode atribuir o arquivo a outro colaborador.",
            );
        }
        if (!await employeesRepository.findById(context.companyId, ownerEmployeeId)) {
            throw new AppError(404, "EMPLOYEE_NOT_FOUND", "Colaborador não encontrado.");
        }

        fileStorageService.validate(file);
        const scan = await fileStorageService.scan(file.buffer);
        const stored = await fileStorageService.write(context.companyId, file.buffer);
        try {
            return await filesRepository.create({
                companyId: context.companyId,
                uploadedByUserId: context.userId,
                ownerEmployeeId,
                purpose: fields.purpose,
                originalName: fileStorageService.safeOriginalName(file.originalname),
                mimeType: file.mimetype,
                byteSize: file.size,
                sha256: stored.sha256,
                storageKey: stored.storageKey,
                scanStatus: scan.status,
                scanDetail: scan.detail,
                retentionUntil: fields.retentionUntil
                    ? new Date(fields.retentionUntil)
                    : undefined,
            }, actor);
        } catch (error) {
            await fileStorageService.remove(stored.storageKey);
            throw error;
        }
    }

    list(context: AuthenticationContext, query: FileListQuery) {
        const canReadCompany = hasAnyPermission(context, ["files.read", "files.manage"]);
        return filesRepository.list(
            context.companyId,
            query,
            canReadCompany ? undefined : context.employeeId,
        );
    }

    async get(context: AuthenticationContext, fileId: string): Promise<StoredFile> {
        const file = await filesRepository.findById(context.companyId, fileId);
        if (!file) throw new AppError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
        requireReadable(context, file);
        return file;
    }

    async download(context: AuthenticationContext, fileId: string): Promise<{
        file: StoredFile;
        content: Buffer;
    }> {
        const file = await this.get(context, fileId);
        return { file, content: await fileStorageService.read(file.storageKey) };
    }

    async createTemporaryLink(
        context: AuthenticationContext,
        fileId: string,
        input: CreateFileLinkInput,
        actor: AuditActor,
    ): Promise<{ downloadUrl: string; expiresAt: Date; maxDownloads: number }> {
        const file = await this.get(context, fileId);
        const rawToken = createOpaqueToken();
        const expiresAt = new Date(Date.now() + (
            input.expiresInMinutes ?? env.FILE_DOWNLOAD_TOKEN_EXPIRES_IN_MINUTES
        ) * 60_000);
        await filesRepository.createAccessToken(
            file,
            hashOpaqueToken(rawToken),
            expiresAt,
            input.maxDownloads,
            actor,
        );
        return {
            downloadUrl: `/api/v1/files/shared/${rawToken}`,
            expiresAt,
            maxDownloads: input.maxDownloads,
        };
    }

    async downloadShared(rawToken: string): Promise<{ file: StoredFile; content: Buffer }> {
        const tokenHash = hashOpaqueToken(rawToken);
        const companyId = await filesRepository.resolveTokenCompany(tokenHash);
        if (!companyId) {
            throw new AppError(
                404,
                "FILE_LINK_INVALID",
                "O link expirou, foi revogado ou atingiu o limite de downloads.",
            );
        }
        return runWithTenantContext(companyId, async () => {
            const file = await filesRepository.findByAccessToken(tokenHash);
            if (!file) throw new AppError(404, "FILE_NOT_FOUND", "Arquivo não encontrado.");
            return { file, content: await fileStorageService.read(file.storageKey) };
        });
    }

    async archive(
        context: AuthenticationContext,
        fileId: string,
        actor: AuditActor,
    ): Promise<void> {
        const file = await this.get(context, fileId);
        const canDelete = context.permissions.includes("files.manage")
            || (file.ownerEmployeeId === context.employeeId
                && file.uploadedByUserId === context.userId);
        if (!canDelete) {
            throw new AppError(403, "FILE_DELETE_DENIED", "Você não pode excluir este arquivo.");
        }
        if (await filesRepository.archive(file, actor)) {
            await fileStorageService.remove(file.storageKey);
        }
    }

    async cleanupExpired(companyId: string): Promise<void> {
        await runWithTenantContext(companyId, async () => {
            const expired = await filesRepository.listExpired(companyId, 100);
            for (const file of expired) {
                await fileStorageService.remove(file.storageKey);
                await filesRepository.markRetentionDeleted(file.id);
            }
            await filesRepository.cleanupExpiredTokens();
        });
    }
}

export const filesService = new FilesService();
