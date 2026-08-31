import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    createNotificationAnnouncementSchema,
    notificationListQuerySchema,
    updateNotificationPreferencesSchema,
} from "../schemas/notifications.schemas.js";
import { notificationsService } from "../services/notifications.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
});

export const listNotifications = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = notificationListQuerySchema.parse(request.query);
    const result = await notificationsService.list(context, query);
    response.json({
        data: { notifications: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const getNotificationSummary = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const summary = await notificationsService.getSummary(context);
    response.json({ data: { summary } });
};

export const markNotificationRead = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await notificationsService.markRead(context, id);
    response.status(204).send();
};

export const markNotificationUnread = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await notificationsService.markUnread(context, id);
    response.status(204).send();
};

export const markAllNotificationsRead = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const updated = await notificationsService.markAllRead(context);
    response.json({ data: { updated } });
};

export const dismissNotification = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await notificationsService.dismiss(context, id);
    response.status(204).send();
};

export const getNotificationPreferences = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const preferences = await notificationsService.getPreferences(context);
    response.json({ data: { preferences } });
};

export const updateNotificationPreferences = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = updateNotificationPreferencesSchema.parse(request.body);
    const preferences = await notificationsService.updatePreferences(context, input);
    response.json({ data: { preferences } });
};

export const createNotificationAnnouncement = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createNotificationAnnouncementSchema.parse(request.body);
    const announcement = await notificationsService.createAnnouncement(
        context,
        input,
        getAuditActor(request),
    );
    response.status(201).json({ data: { announcement } });
};
