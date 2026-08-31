import { z } from "zod";
import {
    hasAtLeastOneDefinedValue,
    paginationQueryShape,
    uuidSchema,
} from "./common.schemas.js";

export const calendarEventTypeSchema = z.enum([
    "meeting",
    "training",
    "interview",
    "deadline",
    "holiday",
    "birthday",
    "onboarding",
    "evaluation",
    "other",
]);
export const calendarEventVisibilitySchema = z.enum([
    "company",
    "department",
    "participants",
]);
export const calendarEventStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);
export const calendarAttendeeResponseSchema = z.enum([
    "pending",
    "accepted",
    "declined",
    "tentative",
]);

const dateTimeSchema = z.string().datetime({ offset: true });
const nullableText = (maximum: number) => z.string().trim().max(maximum).nullable();
const nullableUrl = z.string().trim().url().max(1_000).nullable();
const attendeeEmployeeIdsSchema = z.array(uuidSchema).max(500)
    .refine((ids) => new Set(ids).size === ids.length, "Não repita participantes.");

const validRange = (input: { startsAt?: string; endsAt?: string }): boolean => (
    !input.startsAt
    || !input.endsAt
    || new Date(input.endsAt).getTime() > new Date(input.startsAt).getTime()
);

const eventFields = {
    departmentId: uuidSchema.nullable().optional(),
    title: z.string().trim().min(3).max(180),
    description: nullableText(20_000).optional(),
    eventType: calendarEventTypeSchema,
    visibility: calendarEventVisibilitySchema,
    status: calendarEventStatusSchema,
    location: nullableText(255).optional(),
    meetingUrl: nullableUrl.optional(),
    startsAt: dateTimeSchema,
    endsAt: dateTimeSchema,
    allDay: z.boolean(),
    timezone: z.string().trim().min(1).max(100),
    attendeeEmployeeIds: attendeeEmployeeIdsSchema,
};

export const calendarEventListQuerySchema = z.object({
    ...paginationQueryShape,
    from: dateTimeSchema,
    to: dateTimeSchema,
    search: z.string().trim().max(180).optional(),
    departmentId: uuidSchema.optional(),
    eventType: calendarEventTypeSchema.optional(),
    status: calendarEventStatusSchema.optional(),
}).strict().refine(
    (input) => new Date(input.to).getTime() > new Date(input.from).getTime(),
    { message: "O fim do período deve ser posterior ao início.", path: ["to"] },
).refine(
    (input) => new Date(input.to).getTime() - new Date(input.from).getTime()
        <= 366 * 24 * 60 * 60 * 1_000,
    { message: "O período consultado não pode ultrapassar 366 dias.", path: ["to"] },
);

export const upcomingCalendarEventsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
    eventType: calendarEventTypeSchema.optional(),
}).strict();

export const createCalendarEventSchema = z.object({
    ...eventFields,
    eventType: calendarEventTypeSchema.default("meeting"),
    visibility: calendarEventVisibilitySchema.default("department"),
    status: calendarEventStatusSchema.default("scheduled"),
    allDay: z.boolean().default(false),
    timezone: z.string().trim().min(1).max(100).default("America/Cuiaba"),
    attendeeEmployeeIds: attendeeEmployeeIdsSchema.default([]),
}).strict().refine(validRange, {
    message: "O término do evento deve ser posterior ao início.",
    path: ["endsAt"],
});

export const updateCalendarEventSchema = z.object(eventFields)
    .partial()
    .strict()
    .refine(hasAtLeastOneDefinedValue, {
        message: "Informe ao menos um campo para atualização.",
    })
    .refine(validRange, {
        message: "O término do evento deve ser posterior ao início.",
        path: ["endsAt"],
    });

export const respondCalendarEventSchema = z.object({
    response: z.enum(["accepted", "declined", "tentative"]),
}).strict();

export type CalendarEventListQuery = z.infer<typeof calendarEventListQuerySchema>;
export type UpcomingCalendarEventsQuery = z.infer<typeof upcomingCalendarEventsQuerySchema>;
export type CreateCalendarEventInput = z.infer<typeof createCalendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<typeof updateCalendarEventSchema>;
export type RespondCalendarEventInput = z.infer<typeof respondCalendarEventSchema>;
