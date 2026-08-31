import assert from "node:assert/strict";
import test from "node:test";
import {
    createEmployeeSchema,
    employeeListQuerySchema,
    updateEmployeeSchema,
} from "../dist/schemas/employees.schemas.js";
import {
    createDepartmentSchema,
    createPositionSchema,
    updateCompanySchema,
} from "../dist/schemas/organization.schemas.js";

const departmentId = "7f4a48c4-e67f-4b24-a4fc-87f236951213";
const positionId = "f92bef0e-1304-4c39-a5ae-55d5896d8d72";

test("valida e normaliza o cadastro de colaborador", () => {
    const employee = createEmployeeSchema.parse({
        departmentId,
        positionId,
        employeeCode: "COL001",
        fullName: "Maria da Silva",
        email: "MARIA@EXAMPLE.COM",
        contractType: "clt",
        admissionDate: "2026-08-27",
    });

    assert.equal(employee.email, "maria@example.com");
    assert.equal(employee.status, "active");
});

test("rejeita desligamento anterior à admissão e atualização vazia", () => {
    const invalidDates = createEmployeeSchema.safeParse({
        departmentId,
        positionId,
        employeeCode: "COL002",
        fullName: "João da Silva",
        email: "joao@example.com",
        contractType: "pj",
        admissionDate: "2026-08-27",
        terminationDate: "2026-08-26",
    });

    assert.equal(invalidDates.success, false);
    assert.equal(updateEmployeeSchema.safeParse({}).success, false);
});

test("interpreta paginação e filtros enviados na URL", () => {
    const query = employeeListQuerySchema.parse({
        page: "2",
        pageSize: "25",
        status: "active",
        sortBy: "admissionDate",
        sortOrder: "desc",
    });

    assert.deepEqual(query, {
        page: 2,
        pageSize: 25,
        status: "active",
        sortBy: "admissionDate",
        sortOrder: "desc",
    });
});

test("valida estruturas organizacionais e página de carreiras", () => {
    assert.equal(createDepartmentSchema.safeParse({ name: "Tecnologia" }).success, true);
    assert.equal(createPositionSchema.safeParse({
        departmentId,
        title: "Desenvolvedor",
        baseSalary: -1,
    }).success, false);
    assert.equal(updateCompanySchema.safeParse({ careersSlug: "RH Umi" }).success, false);
    assert.equal(updateCompanySchema.safeParse({ careersSlug: "rhumi-talentos" }).success, true);
});
