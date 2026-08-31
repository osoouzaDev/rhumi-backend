interface PostgreSqlError {
    code?: string;
    constraint?: string;
}

export const isPostgreSqlError = (error: unknown): error is PostgreSqlError => (
    typeof error === "object"
    && error !== null
    && "code" in error
);

export const hasDatabaseConstraint = (
    error: unknown,
    ...constraints: string[]
): boolean => isPostgreSqlError(error)
    && error.code === "23505"
    && typeof error.constraint === "string"
    && constraints.includes(error.constraint);
