import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import { filesRepository } from "../repositories/files.repository.js";
import type { AuditActor } from "../repositories/organization.repository.js";
import { privacyRepository, type PrivacyRequestRecord } from "../repositories/privacy.repository.js";
import type {
    CreatePrivacyRequestInput,
    PrivacyRequestListQuery,
    ProcessPrivacyRequestInput,
    RecordConsentInput,
} from "../schemas/privacy.schemas.js";
import { fileStorageService } from "./file-storage.service.js";

const isPrivacyAdministrator = (context: AuthenticationContext): boolean => (
    context.permissions.includes("privacy.manage")
    || context.permissions.includes("privacy.read")
);

const requirePending = (request: PrivacyRequestRecord): void => {
    if (request.status !== "pending") {
        throw new AppError(
            409,
            "PRIVACY_REQUEST_ALREADY_PROCESSED",
            "A solicitação já foi processada.",
        );
    }
};

export class PrivacyService {
    recordOwnConsent(
        context: AuthenticationContext,
        input: RecordConsentInput,
        metadata: { ipAddress?: string; userAgent?: string },
    ) {
        return privacyRepository.recordConsent(
            context.companyId,
            context.employeeId,
            context.userId,
            input,
            metadata,
        );
    }

    listOwnConsents(context: AuthenticationContext) {
        return privacyRepository.listConsents(context.companyId, context.employeeId);
    }

    createOwnRequest(
        context: AuthenticationContext,
        input: CreatePrivacyRequestInput,
        actor: AuditActor,
    ) {
        return privacyRepository.createRequest(
            context.companyId,
            context.employeeId,
            context.userId,
            input,
            actor,
        );
    }

    listRequests(context: AuthenticationContext, query: PrivacyRequestListQuery) {
        return privacyRepository.listRequests(
            context.companyId,
            query,
            isPrivacyAdministrator(context) ? undefined : context.employeeId,
        );
    }

    async process(
        context: AuthenticationContext,
        requestId: string,
        input: ProcessPrivacyRequestInput,
        actor: AuditActor,
    ): Promise<PrivacyRequestRecord> {
        const request = await privacyRepository.findRequest(context.companyId, requestId);
        if (!request) {
            throw new AppError(404, "PRIVACY_REQUEST_NOT_FOUND", "Solicitação não encontrada.");
        }
        requirePending(request);
        if (input.decision === "reject") {
            await privacyRepository.rejectRequest(request, input.notes, actor);
        } else if (request.type === "export") {
            await this.completeExport(request, input.notes, actor);
        } else {
            if (!input.confirmIrreversibleAnonymization) {
                throw new AppError(
                    422,
                    "ANONYMIZATION_CONFIRMATION_REQUIRED",
                    "Confirme explicitamente a anonimização irreversível.",
                );
            }
            const storageKeys = await privacyRepository.anonymize(request, input.notes, actor);
            await Promise.all(storageKeys.map((storageKey) => fileStorageService.remove(storageKey)));
        }
        const processed = await privacyRepository.findRequest(context.companyId, requestId);
        if (!processed) {
            throw new AppError(500, "PRIVACY_REQUEST_LOST", "Falha ao consultar a solicitação.");
        }
        return processed;
    }

    private async completeExport(
        request: PrivacyRequestRecord,
        notes: string,
        actor: AuditActor,
    ): Promise<void> {
        const exportedData = await privacyRepository.exportEmployeeData(
            request.companyId,
            request.employeeId,
        );
        const buffer = Buffer.from(JSON.stringify(exportedData, null, 2), "utf8");
        const written = await fileStorageService.write(request.companyId, buffer);
        let resultFileId: string | undefined;
        try {
            const resultFile = await filesRepository.create({
                companyId: request.companyId,
                uploadedByUserId: actor.userId,
                ownerEmployeeId: request.employeeId,
                purpose: "privacy_export",
                originalName: `dados-pessoais-${request.employeeId}.json`,
                mimeType: "application/json",
                byteSize: buffer.length,
                sha256: written.sha256,
                storageKey: written.storageKey,
                scanStatus: "clean",
                scanDetail: "server_generated",
                retentionUntil: new Date(Date.now() + 7 * 24 * 60 * 60_000),
            }, actor);
            resultFileId = resultFile.id;
            await privacyRepository.completeExport(request, resultFile.id, notes, actor);
        } catch (error) {
            if (!resultFileId) await fileStorageService.remove(written.storageKey);
            throw error;
        }
    }
}

export const privacyService = new PrivacyService();
