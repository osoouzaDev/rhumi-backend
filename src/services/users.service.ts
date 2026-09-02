import argon2 from "argon2";
import { AppError } from "../errors/app-error.js";
import type { AuthenticationContext } from "../repositories/auth.repository.js";
import type { AuditActor, PaginatedResult } from "../repositories/organization.repository.js";
import {
    usersRepository,
    type PermissionDefinition,
    type ResolvedPermissionOverride,
    type RoleDefinition,
    type UserAccount,
} from "../repositories/users.repository.js";
import type {
    CreateUserInput,
    PermissionOverrideInput,
    UpdateUserInput,
    UserListQuery,
} from "../schemas/users.schemas.js";
import { createOpaqueToken } from "../utils/auth-tokens.js";
import { accountService } from "./account.service.js";

const userNotFound = (): AppError => new AppError(
    404,
    "USER_NOT_FOUND",
    "Conta de acesso não encontrada.",
);

interface ResolvedAccess {
    roleIds: string[];
    permissionOverrides: ResolvedPermissionOverride[];
}

export class UsersService {
    list(
        context: AuthenticationContext,
        query: UserListQuery,
    ): Promise<PaginatedResult<UserAccount>> {
        return usersRepository.list(context.companyId, query);
    }

    async getById(context: AuthenticationContext, userId: string): Promise<UserAccount> {
        const account = await usersRepository.findById(context.companyId, userId);
        if (!account) {
            throw userNotFound();
        }
        return account;
    }

    listRoles(context: AuthenticationContext): Promise<RoleDefinition[]> {
        return usersRepository.listRoles(context.companyId);
    }

    listPermissions(): Promise<PermissionDefinition[]> {
        return usersRepository.listPermissions();
    }

    async create(
        context: AuthenticationContext,
        input: CreateUserInput,
        actor: AuditActor,
    ): Promise<{
        user: UserAccount;
        invitation: Awaited<ReturnType<typeof accountService.issueInvitation>>;
    }> {
        const employee = await usersRepository.findEmployeeCandidate(
            context.companyId,
            input.employeeId,
        );
        if (!employee) {
            throw new AppError(
                422,
                "INVALID_ACCOUNT_EMPLOYEE",
                "O colaborador informado não existe nesta empresa.",
            );
        }
        if (employee.employeeStatus !== "active") {
            throw new AppError(
                409,
                "EMPLOYEE_NOT_ACTIVE",
                "Somente colaboradores ativos podem receber uma conta de acesso.",
            );
        }
        if (employee.accountId && !employee.accountDeletedAt) {
            throw new AppError(
                409,
                "EMPLOYEE_ACCOUNT_ALREADY_EXISTS",
                "Este colaborador já possui uma conta de acesso.",
            );
        }

        const access = await this.resolveAccess(
            context.companyId,
            input.roleCodes,
            input.permissionOverrides,
        );
        const passwordHash = await argon2.hash(createOpaqueToken(), { type: argon2.argon2id });

        const user = await usersRepository.createOrRestore(
            context.companyId,
            {
                employeeId: input.employeeId,
                passwordHash,
                roleIds: access.roleIds,
                permissionOverrides: access.permissionOverrides,
            },
            actor,
        );
        const invitation = await accountService.issueInvitation(context, user.id, actor);
        return { user, invitation };
    }


    async update(
        context: AuthenticationContext,
        userId: string,
        input: UpdateUserInput,
        actor: AuditActor,
    ): Promise<UserAccount> {
        const current = await this.getById(context, userId);
        this.assertSafeSelfUpdate(context, current, input);
        await this.assertAdministratorContinuity(context.companyId, current, input);

        const access = input.roleCodes || input.permissionOverrides
            ? await this.resolveAccess(
                context.companyId,
                input.roleCodes ?? current.roles,
                input.permissionOverrides ?? current.permissionOverrides,
            )
            : undefined;

        const account = await usersRepository.update(
            context.companyId,
            userId,
            {
                status: input.status,
                roleIds: input.roleCodes ? access?.roleIds : undefined,
                permissionOverrides: input.permissionOverrides
                    ? access?.permissionOverrides
                    : undefined,
            },
            actor,
        );
        if (!account) {
            throw userNotFound();
        }
        return account;
    }

    async archive(
        context: AuthenticationContext,
        userId: string,
        actor: AuditActor,
    ): Promise<void> {
        if (userId === context.userId) {
            throw new AppError(
                409,
                "CANNOT_ARCHIVE_OWN_USER",
                "Você não pode excluir a própria conta de acesso.",
            );
        }

        const current = await this.getById(context, userId);
        await this.assertAdministratorContinuity(context.companyId, current, {
            status: "inactive",
        });
        const archived = await usersRepository.archive(context.companyId, userId, actor);
        if (!archived) {
            throw userNotFound();
        }
    }

    private async resolveAccess(
        companyId: string,
        roleCodes: string[],
        overrides: PermissionOverrideInput[],
    ): Promise<ResolvedAccess> {
        const normalizedRoleCodes = roleCodes.map((code) => code.toLowerCase());
        const roles = await usersRepository.findRolesByCodes(companyId, normalizedRoleCodes);
        const foundRoleCodes = new Set(roles.map((role) => role.code.toLowerCase()));
        const missingRoleCodes = normalizedRoleCodes.filter((code) => !foundRoleCodes.has(code));
        if (missingRoleCodes.length > 0) {
            throw new AppError(
                422,
                "INVALID_ROLE_CODES",
                "Um ou mais perfis de acesso não existem.",
                { missingRoleCodes },
            );
        }

        const permissionCodes = overrides.map((override) => override.permissionCode.toLowerCase());
        const permissions = await usersRepository.findPermissionsByCodes(permissionCodes);
        const permissionsByCode = new Map(
            permissions.map((permission) => [permission.code.toLowerCase(), permission]),
        );
        const missingPermissionCodes = permissionCodes.filter(
            (code) => !permissionsByCode.has(code),
        );
        if (missingPermissionCodes.length > 0) {
            throw new AppError(
                422,
                "INVALID_PERMISSION_CODES",
                "Uma ou mais permissões individuais não existem.",
                { missingPermissionCodes },
            );
        }

        return {
            roleIds: roles.map((role) => role.id),
            permissionOverrides: overrides.map((override) => ({
                permissionId: permissionsByCode.get(override.permissionCode.toLowerCase())!.id,
                effect: override.effect,
            })),
        };
    }

    private assertSafeSelfUpdate(
        context: AuthenticationContext,
        current: UserAccount,
        input: UpdateUserInput,
    ): void {
        if (current.id !== context.userId) {
            return;
        }
        if (
            (input.status !== undefined && input.status !== "active")
            || input.roleCodes !== undefined
            || input.permissionOverrides !== undefined
        ) {
            throw new AppError(
                409,
                "CANNOT_CHANGE_OWN_ACCESS",
                "Você não pode bloquear nem alterar os próprios perfis e permissões.",
            );
        }
    }

    private async assertAdministratorContinuity(
        companyId: string,
        current: UserAccount,
        input: Pick<UpdateUserInput, "status" | "roleCodes">,
    ): Promise<void> {
        const isActiveAdministrator = current.status === "active"
            && current.roles.some((role) => role.toLowerCase() === "administrator");
        if (!isActiveAdministrator) {
            return;
        }

        const willRemainActive = (input.status ?? current.status) === "active";
        const willRemainAdministrator = (input.roleCodes ?? current.roles)
            .some((role) => role.toLowerCase() === "administrator");
        if (willRemainActive && willRemainAdministrator) {
            return;
        }

        const administrators = await usersRepository.countActiveAdministrators(companyId);
        if (administrators <= 1) {
            throw new AppError(
                409,
                "LAST_ADMINISTRATOR_REQUIRED",
                "A empresa precisa manter ao menos uma conta administradora ativa.",
            );
        }
    }
}

export const usersService = new UsersService();
