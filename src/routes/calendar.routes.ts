import { Router } from "express";
import {
    archiveCalendarEvent,
    createCalendarEvent,
    getCalendarEvent,
    listCalendarEvents,
    listUpcomingCalendarEvents,
    respondCalendarEvent,
    updateCalendarEvent,
} from "../controllers/calendar.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const calendarRoutes = Router();

calendarRoutes.use(authenticate);

calendarRoutes.get("/events", authorize("calendar.read"), listCalendarEvents);
calendarRoutes.get(
    "/events/upcoming",
    authorize("calendar.read"),
    listUpcomingCalendarEvents,
);
calendarRoutes.get("/events/:id", authorize("calendar.read"), getCalendarEvent);
calendarRoutes.post("/events", authorize("calendar.manage"), createCalendarEvent);
calendarRoutes.patch("/events/:id", authorize("calendar.manage"), updateCalendarEvent);
calendarRoutes.delete("/events/:id", authorize("calendar.manage"), archiveCalendarEvent);
calendarRoutes.patch(
    "/events/:id/response",
    authorize("calendar.respond"),
    respondCalendarEvent,
);

export default calendarRoutes;
