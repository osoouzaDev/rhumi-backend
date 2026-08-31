import type { Request, Response } from "express";
import { idParameterSchema } from "../schemas/common.schemas.js";
import {
    calendarEventListQuerySchema,
    createCalendarEventSchema,
    respondCalendarEventSchema,
    updateCalendarEventSchema,
    upcomingCalendarEventsQuerySchema,
} from "../schemas/calendar.schemas.js";
import { calendarService } from "../services/calendar.service.js";
import { getAuditActor, requireAuthenticationContext } from "../utils/request-auth.js";

const paginationMeta = (page: number, pageSize: number, total: number) => ({
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
});

export const listCalendarEvents = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = calendarEventListQuerySchema.parse(request.query);
    const result = await calendarService.listEvents(context, query);
    response.json({
        data: { events: result.items },
        meta: paginationMeta(query.page, query.pageSize, result.total),
    });
};

export const listUpcomingCalendarEvents = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const query = upcomingCalendarEventsQuerySchema.parse(request.query);
    const events = await calendarService.listUpcoming(context, query);
    response.json({ data: { events } });
};

export const getCalendarEvent = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const event = await calendarService.getEvent(context, id);
    response.json({ data: { event } });
};

export const createCalendarEvent = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const input = createCalendarEventSchema.parse(request.body);
    const event = await calendarService.createEvent(context, input, getAuditActor(request));
    response.status(201).json({ data: { event } });
};

export const updateCalendarEvent = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = updateCalendarEventSchema.parse(request.body);
    const event = await calendarService.updateEvent(context, id, input, getAuditActor(request));
    response.json({ data: { event } });
};

export const archiveCalendarEvent = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    await calendarService.archiveEvent(context, id, getAuditActor(request));
    response.status(204).send();
};

export const respondCalendarEvent = async (
    request: Request,
    response: Response,
): Promise<void> => {
    const context = requireAuthenticationContext(request);
    const { id } = idParameterSchema.parse(request.params);
    const input = respondCalendarEventSchema.parse(request.body);
    const event = await calendarService.respondToEvent(
        context,
        id,
        input,
        getAuditActor(request),
    );
    response.json({ data: { event } });
};
