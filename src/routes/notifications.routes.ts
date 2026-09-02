import { Router } from "express";
import {
    createNotificationAnnouncement,
    dismissNotification,
    getNotificationPreferences,
    getNotificationSummary,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
    markNotificationUnread,
    updateNotificationPreferences,
} from "../controllers/notifications.controller.js";
import { streamNotifications } from "../controllers/notification-stream.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const notificationsRoutes = Router();
notificationsRoutes.use(authenticate);

notificationsRoutes.get("/stream", authorize("notifications.read"), streamNotifications);
notificationsRoutes.get("/", authorize("notifications.read"), listNotifications);
notificationsRoutes.get("/summary", authorize("notifications.read"), getNotificationSummary);
notificationsRoutes.post(
    "/read-all",
    authorize("notifications.read"),
    markAllNotificationsRead,
);
notificationsRoutes.get(
    "/preferences",
    authorize("notifications.read"),
    getNotificationPreferences,
);
notificationsRoutes.put(
    "/preferences",
    authorize("notifications.read"),
    updateNotificationPreferences,
);
notificationsRoutes.post(
    "/announcements",
    authorize("notifications.manage"),
    createNotificationAnnouncement,
);
notificationsRoutes.patch(
    "/:id/read",
    authorize("notifications.read"),
    markNotificationRead,
);
notificationsRoutes.patch(
    "/:id/unread",
    authorize("notifications.read"),
    markNotificationUnread,
);
notificationsRoutes.delete(
    "/:id",
    authorize("notifications.read"),
    dismissNotification,
);

export default notificationsRoutes;
