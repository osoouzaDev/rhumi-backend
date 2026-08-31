import assert from "node:assert/strict";
import test from "node:test";
import {
    createUserSchema,
    updateUserSchema,
    userListQuerySchema,
} from "../dist/schemas/users.schemas.js";

const employeeId = "9fe7f5b9-f108-4972-9368-e0fba9076b71";

test("valida e normaliza a criação de conta de acesso", () => {
    const input = createUserSchema.parse({
        employeeId,
        password: "uma-senha-segura-123",
        roleCodes: ["Administrator"],
        permissionOverrides: [{
            permissionCode: "EMPLOYEES.READ",
            effect: "deny",
        }],
    });

    assert.deepEqual(input.roleCodes, ["administrator"]);
    assert.equal(input.permissionOverrides[0].permissionCode, "employees.read");
});

test("rejeita senha curta e perfis ou permissões repetidos", () => {
    assert.equal(createUserSchema.safeParse({
        employeeId,
        password: "curta",
        roleCodes: ["collaborator"],
    }).success, false);

    assert.equal(createUserSchema.safeParse({
        employeeId,
        password: "uma-senha-segura-123",
        roleCodes: ["supervisor", "supervisor"],
    }).success, false);

    assert.equal(updateUserSchema.safeParse({
        permissionOverrides: [
            { permissionCode: "employees.read", effect: "allow" },
            { permissionCode: "employees.read", effect: "deny" },
        ],
    }).success, false);
});

test("rejeita atualização vazia e interpreta filtros de contas", () => {
    assert.equal(updateUserSchema.safeParse({}).success, false);

    const query = userListQuerySchema.parse({
        page: "2",
        pageSize: "10",
        status: "blocked",
        roleCode: "Supervisor",
    });
    assert.deepEqual(query, {
        page: 2,
        pageSize: 10,
        status: "blocked",
        roleCode: "supervisor",
    });
});
