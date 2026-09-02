import { env } from "../config/env.js";
import { runWithTenantContext } from "../database/tenant-context.js";
import { emailRepository, type EmailJob } from "../repositories/email.repository.js";
import { notificationAutomationRepository } from "../repositories/notification-automation.repository.js";
import { notificationsRepository } from "../repositories/notifications.repository.js";
import { emailService } from "./email.service.js";
import { filesService } from "./files.service.js";
import { logger } from "../utils/logger.js";

let emailTimer: NodeJS.Timeout | undefined;
let automationTimer: NodeJS.Timeout | undefined;
let retentionTimer: NodeJS.Timeout | undefined;
let emailCycle: Promise<void> | undefined;
let automationCycle: Promise<void> | undefined;
let retentionCycle: Promise<void> | undefined;

const safeErrorMessage = (error: unknown): string => error instanceof Error
    ? `${error.name}: ${error.message}`
    : "Unknown e-mail delivery error";

const retryAt = (job: EmailJob): Date => {
    const delayMinutes = Math.min(2 ** Math.max(0, job.attempts - 1), 60);
    return new Date(Date.now() + delayMinutes * 60_000);
};

const processCompanyEmail = async (companyId: string): Promise<void> => {
    await runWithTenantContext(companyId, async () => {
        const jobs = await emailRepository.claimBatch(
            companyId,
            env.EMAIL_WORKER_BATCH_SIZE,
            env.EMAIL_LOCK_TIMEOUT_MINUTES,
        );
        for (const job of jobs) {
            try {
                await emailService.send(job);
                await emailRepository.markSent(job.id);
            } catch (error) {
                await emailRepository.markFailed(job, safeErrorMessage(error), retryAt(job));
            }
        }
    });
};

export const runEmailDeliveryCycle = async (): Promise<void> => {
    if (!env.EMAIL_DELIVERY_ENABLED) return;
    const companyIds = await emailRepository.listDueCompanyIds(100);
    for (const companyId of companyIds) {
        await processCompanyEmail(companyId);
    }
};

const automateCompany = async (companyId: string): Promise<void> => {
    await runWithTenantContext(companyId, async () => {
        const recipients = await notificationAutomationRepository.listRecipients(companyId);
        for (const recipient of recipients) {
            await notificationsRepository.syncAutomatic(recipient);
        }
        await notificationAutomationRepository.queueImmediate(companyId);
        await notificationAutomationRepository.queueReminders(companyId);
        await notificationAutomationRepository.queueDigests(companyId);
    });
};

export const runNotificationAutomationCycle = async (): Promise<void> => {
    if (!env.NOTIFICATION_AUTOMATION_ENABLED) return;
    const companyIds = await emailRepository.listActiveCompanyIds();
    for (const companyId of companyIds) {
        try {
            await automateCompany(companyId);
        } catch (error) {
            logger.error("notifications.automation_company_failed", {
                companyId,
                error: safeErrorMessage(error),
            });
        }
    }
};

export const runFileRetentionCycle = async (): Promise<void> => {
    if (!env.FILE_RETENTION_CLEANUP_ENABLED) return;
    const companyIds = await emailRepository.listActiveCompanyIds();
    for (const companyId of companyIds) {
        await filesService.cleanupExpired(companyId);
    }
};

const scheduleEmailCycle = (): void => {
    if (emailCycle) return;
    emailCycle = runEmailDeliveryCycle()
        .catch((error) => logger.error("email.delivery_cycle_failed", {
            error: safeErrorMessage(error),
        }))
        .finally(() => { emailCycle = undefined; });
};

const scheduleAutomationCycle = (): void => {
    if (automationCycle) return;
    automationCycle = runNotificationAutomationCycle()
        .catch((error) => logger.error("notifications.automation_cycle_failed", {
            error: safeErrorMessage(error),
        }))
        .finally(() => { automationCycle = undefined; });
};


const scheduleRetentionCycle = (): void => {
    if (retentionCycle) return;
    retentionCycle = runFileRetentionCycle()
        .catch((error) => logger.error("files.retention_cycle_failed", {
            error: safeErrorMessage(error),
        }))
        .finally(() => { retentionCycle = undefined; });
};
export const startBackgroundWorkers = (): void => {
    if (env.EMAIL_DELIVERY_ENABLED) {
        scheduleEmailCycle();
        emailTimer = setInterval(scheduleEmailCycle, env.EMAIL_WORKER_INTERVAL_MS);
        emailTimer.unref();
    }
    if (env.NOTIFICATION_AUTOMATION_ENABLED) {
        scheduleAutomationCycle();
        automationTimer = setInterval(
            scheduleAutomationCycle,
            env.NOTIFICATION_AUTOMATION_INTERVAL_MS,
        );
        automationTimer.unref();
    }
    if (env.FILE_RETENTION_CLEANUP_ENABLED) {
        scheduleRetentionCycle();
        retentionTimer = setInterval(
            scheduleRetentionCycle,
            env.FILE_RETENTION_CLEANUP_INTERVAL_MS,
        );
        retentionTimer.unref();
    }
};

export const stopBackgroundWorkers = async (): Promise<void> => {
    if (emailTimer) clearInterval(emailTimer);
    if (automationTimer) clearInterval(automationTimer);
    if (retentionTimer) clearInterval(retentionTimer);
    await Promise.allSettled([
        emailCycle ?? Promise.resolve(),
        automationCycle ?? Promise.resolve(),
        retentionCycle ?? Promise.resolve(),
    ]);
    emailService.close();
};
