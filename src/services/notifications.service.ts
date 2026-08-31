import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    notificationsRepository,
    type NotificationPreferences,
} from "../repositories/notifications.repository.js";
import type { AuditActor } from "../repositories/organization.repository.js";
import type {
    CreateNotificationAnnouncementInput,
    NotificationListQuery,
    UpdateNotificationPreferencesInput,
} from "../schemas/notifications.schemas.js";

const notificationNotFound = (): AppError => new AppError(
    404,
    "NOTIFICATION_NOT_FOUND",
    "Notificação não encontrada.",
);

const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);

export class NotificationsService {
    async list(context: AuthenticationContext, query: NotificationListQuery) {
        await notificationsRepository.syncAutomatic(context);
        return notificationsRepository.list(context, query);
    }

    async getSummary(context: AuthenticationContext) {
        await notificationsRepository.syncAutomatic(context);
        return notificationsRepository.getSummary(context);
    }

    async markRead(context: AuthenticationContext, notificationId: string): Promise<void> {
        if (!await notificationsRepository.markRead(context, notificationId)) {
            throw notificationNotFound();
        }
    }

    async markUnread(context: AuthenticationContext, notificationId: string): Promise<void> {
        if (!await notificationsRepository.markUnread(context, notificationId)) {
            throw notificationNotFound();
        }
    }

    async markAllRead(context: AuthenticationContext): Promise<number> {
        return notificationsRepository.markAllRead(context);
    }

    async dismiss(context: AuthenticationContext, notificationId: string): Promise<void> {
        if (!await notificationsRepository.dismiss(context, notificationId)) {
            throw notificationNotFound();
        }
    }

    getPreferences(context: AuthenticationContext) {
        return notificationsRepository.getPreferences(context);
    }

    async updatePreferences(
        context: AuthenticationContext,
        input: UpdateNotificationPreferencesInput,
    ): Promise<NotificationPreferences> {
        const current = await notificationsRepository.getPreferences(context);
        const quietHoursStart = input.quietHoursStart !== undefined
            ? input.quietHoursStart : current.quietHoursStart;
        const quietHoursEnd = input.quietHoursEnd !== undefined
            ? input.quietHoursEnd : current.quietHoursEnd;
        if ((quietHoursStart === null) !== (quietHoursEnd === null)) {
            throw new AppError(
                422,
                "INVALID_NOTIFICATION_QUIET_HOURS",
                "Informe o início e o fim do horário silencioso.",
            );
        }
        return notificationsRepository.savePreferences(context, {
            inAppEnabled: input.inAppEnabled ?? current.inAppEnabled,
            emailEnabled: input.emailEnabled ?? current.emailEnabled,
            digestFrequency: input.digestFrequency ?? current.digestFrequency,
            reminderDays: [...(input.reminderDays ?? current.reminderDays)].sort((a, b) => a - b),
            notifyLowPriority: input.notifyLowPriority ?? current.notifyLowPriority,
            quietHoursStart,
            quietHoursEnd,
            timezone: input.timezone ?? current.timezone,
        });
    }

    async createAnnouncement(
        context: AuthenticationContext,
        input: CreateNotificationAnnouncementInput,
        actor: AuditActor,
    ) {
        if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
            throw new AppError(
                422,
                "INVALID_NOTIFICATION_EXPIRATION",
                "A expiração do comunicado precisa estar no futuro.",
            );
        }

        const administrator = isAdministrator(context);
        let departmentId: string | undefined;
        let employeeIds: string[] | undefined;

        if (input.audienceType === "company") {
            if (!administrator) {
                throw new AppError(
                    403,
                    "NOTIFICATION_COMPANY_AUDIENCE_FORBIDDEN",
                    "Somente administradores podem publicar para toda a empresa.",
                );
            }
        } else if (input.audienceType === "department") {
            departmentId = input.departmentId ?? undefined;
            if (!administrator && departmentId !== context.departmentId) {
                throw new AppError(
                    403,
                    "NOTIFICATION_DEPARTMENT_SCOPE_FORBIDDEN",
                    "O comunicado precisa permanecer no setor do supervisor.",
                );
            }
        } else {
            employeeIds = input.employeeIds;
            if (!administrator) departmentId = context.departmentId;
        }

        const recipients = await notificationsRepository.findEligibleRecipients(
            context.companyId,
            departmentId,
            employeeIds,
        );
        if (input.audienceType === "employees") {
            const eligibleIds = new Set(recipients.map((recipient) => recipient.employee_id));
            const invalidEmployeeIds = input.employeeIds.filter((id) => !eligibleIds.has(id));
            if (invalidEmployeeIds.length > 0) {
                throw new AppError(
                    422,
                    "INVALID_NOTIFICATION_RECIPIENTS",
                    "Há destinatários inativos, inexistentes ou fora do escopo permitido.",
                    { invalidEmployeeIds },
                );
            }
        }
        if (recipients.length === 0) {
            throw new AppError(
                422,
                "NOTIFICATION_AUDIENCE_EMPTY",
                "O público selecionado não possui contas ativas.",
            );
        }

        return notificationsRepository.createAnnouncement(
            context,
            input,
            input.audienceType === "department" ? departmentId ?? null : null,
            recipients,
            actor,
        );
    }
}

export const notificationsService = new NotificationsService();
