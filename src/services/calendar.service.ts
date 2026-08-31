import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import {
    calendarRepository,
    type CalendarEvent,
} from "../repositories/calendar.repository.js";
import { organizationRepository, type AuditActor } from "../repositories/organization.repository.js";
import type {
    CalendarEventListQuery,
    CreateCalendarEventInput,
    RespondCalendarEventInput,
    UpdateCalendarEventInput,
    UpcomingCalendarEventsQuery,
} from "../schemas/calendar.schemas.js";

const eventNotFound = (): AppError => new AppError(
    404,
    "CALENDAR_EVENT_NOT_FOUND",
    "Evento do calendário não encontrado.",
);

const isAdministrator = (context: AuthenticationContext): boolean => (
    context.roles.includes("administrator")
);

export class CalendarService {
    async listEvents(context: AuthenticationContext, query: CalendarEventListQuery) {
        if (
            query.departmentId
            && !isAdministrator(context)
            && query.departmentId !== context.departmentId
        ) {
            throw new AppError(
                403,
                "CALENDAR_DEPARTMENT_SCOPE_DENIED",
                "Você só pode consultar o calendário do seu departamento.",
            );
        }
        return calendarRepository.list(context, query);
    }

    listUpcoming(
        context: AuthenticationContext,
        query: UpcomingCalendarEventsQuery,
    ): Promise<CalendarEvent[]> {
        return calendarRepository.listUpcoming(context, query);
    }

    async getEvent(context: AuthenticationContext, eventId: string): Promise<CalendarEvent> {
        const event = await calendarRepository.findById(context, eventId);
        if (!event) {
            throw eventNotFound();
        }
        return event;
    }

    async createEvent(
        context: AuthenticationContext,
        input: CreateCalendarEventInput,
        actor: AuditActor,
    ): Promise<CalendarEvent> {
        this.assertValidRange(input.startsAt, input.endsAt);
        this.assertValidTimezone(input.timezone);
        const departmentId = await this.resolveDepartment(
            context,
            input.visibility,
            input.departmentId,
        );
        await this.assertValidAttendees(context.companyId, input.attendeeEmployeeIds);

        const eventId = await calendarRepository.create(context, input, departmentId, actor);
        return this.getEvent(context, eventId);
    }

    async updateEvent(
        context: AuthenticationContext,
        eventId: string,
        input: UpdateCalendarEventInput,
        actor: AuditActor,
    ): Promise<CalendarEvent> {
        const current = await this.getEvent(context, eventId);
        this.assertCanManage(context, current);

        const startsAt = input.startsAt ?? current.startsAt.toISOString();
        const endsAt = input.endsAt ?? current.endsAt.toISOString();
        this.assertValidRange(startsAt, endsAt);
        if (input.timezone) {
            this.assertValidTimezone(input.timezone);
        }
        if (input.attendeeEmployeeIds) {
            await this.assertValidAttendees(context.companyId, input.attendeeEmployeeIds);
        }

        let departmentId: string | null | undefined;
        if (input.visibility !== undefined || input.departmentId !== undefined) {
            departmentId = await this.resolveDepartment(
                context,
                input.visibility ?? current.visibility,
                input.departmentId === undefined ? current.departmentId : input.departmentId,
            );
        }

        if (!await calendarRepository.update(context, eventId, input, departmentId, actor)) {
            throw eventNotFound();
        }
        return this.getEvent(context, eventId);
    }

    async archiveEvent(
        context: AuthenticationContext,
        eventId: string,
        actor: AuditActor,
    ): Promise<void> {
        const current = await this.getEvent(context, eventId);
        this.assertCanManage(context, current);
        if (!await calendarRepository.archive(context, eventId, actor)) {
            throw eventNotFound();
        }
    }

    async respondToEvent(
        context: AuthenticationContext,
        eventId: string,
        input: RespondCalendarEventInput,
        actor: AuditActor,
    ): Promise<CalendarEvent> {
        const current = await this.getEvent(context, eventId);
        if (current.status !== "scheduled") {
            throw new AppError(
                409,
                "CALENDAR_EVENT_NOT_OPEN_FOR_RESPONSES",
                "Somente eventos agendados podem receber respostas.",
            );
        }
        if (!current.attendees.some((attendee) => attendee.employeeId === context.employeeId)) {
            throw new AppError(
                403,
                "CALENDAR_ATTENDEE_REQUIRED",
                "Somente participantes convidados podem responder ao evento.",
            );
        }
        if (!await calendarRepository.respond(context, eventId, input.response, actor)) {
            throw eventNotFound();
        }
        return this.getEvent(context, eventId);
    }

    getDashboardMetrics(context: AuthenticationContext) {
        return calendarRepository.getDashboardMetrics(context);
    }

    private assertCanManage(context: AuthenticationContext, event: CalendarEvent): void {
        if (isAdministrator(context)) {
            return;
        }
        const ownsEvent = event.createdBy === context.userId;
        const managesDepartmentEvent = event.visibility === "department"
            && event.departmentId === context.departmentId;
        if (!ownsEvent && !managesDepartmentEvent) {
            throw new AppError(
                403,
                "CALENDAR_EVENT_MANAGEMENT_DENIED",
                "Você não pode alterar este evento.",
            );
        }
        if (event.visibility === "company") {
            throw new AppError(
                403,
                "CALENDAR_COMPANY_SCOPE_REQUIRES_ADMIN",
                "Somente administradores podem gerenciar eventos para toda a empresa.",
            );
        }
    }

    private async resolveDepartment(
        context: AuthenticationContext,
        visibility: CreateCalendarEventInput["visibility"],
        requestedDepartmentId?: string | null,
    ): Promise<string | null> {
        if (visibility === "company") {
            if (!isAdministrator(context)) {
                throw new AppError(
                    403,
                    "CALENDAR_COMPANY_SCOPE_REQUIRES_ADMIN",
                    "Somente administradores podem criar eventos para toda a empresa.",
                );
            }
            return null;
        }
        if (visibility === "participants") {
            return null;
        }

        const departmentId = requestedDepartmentId ?? context.departmentId;
        if (!isAdministrator(context) && departmentId !== context.departmentId) {
            throw new AppError(
                403,
                "CALENDAR_DEPARTMENT_SCOPE_DENIED",
                "Você só pode gerenciar eventos do seu departamento.",
            );
        }
        const department = await organizationRepository.findDepartment(
            context.companyId,
            departmentId,
        );
        if (!department) {
            throw new AppError(
                422,
                "CALENDAR_DEPARTMENT_NOT_FOUND",
                "O departamento informado não existe.",
            );
        }
        if (!department.active) {
            throw new AppError(
                409,
                "CALENDAR_DEPARTMENT_INACTIVE",
                "O departamento informado está inativo.",
            );
        }
        return departmentId;
    }

    private async assertValidAttendees(companyId: string, employeeIds: string[]): Promise<void> {
        const activeIds = await calendarRepository.findActiveEmployeeIds(companyId, employeeIds);
        if (activeIds.length !== employeeIds.length) {
            const activeIdSet = new Set(activeIds);
            throw new AppError(
                422,
                "INVALID_CALENDAR_ATTENDEES",
                "Um ou mais participantes não existem ou estão inativos.",
                { invalidEmployeeIds: employeeIds.filter((id) => !activeIdSet.has(id)) },
            );
        }
    }

    private assertValidRange(startsAt: string, endsAt: string): void {
        if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
            throw new AppError(
                422,
                "INVALID_CALENDAR_EVENT_RANGE",
                "O término do evento deve ser posterior ao início.",
            );
        }
    }

    private assertValidTimezone(timezone: string): void {
        try {
            new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format();
        } catch {
            throw new AppError(
                422,
                "INVALID_CALENDAR_TIMEZONE",
                "O fuso horário informado é inválido.",
            );
        }
    }
}

export const calendarService = new CalendarService();
