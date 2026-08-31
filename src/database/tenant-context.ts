import { AsyncLocalStorage } from "node:async_hooks";

interface TenantContext {
    companyId: string;
}

const tenantStorage = new AsyncLocalStorage<TenantContext>();

export const runWithTenantContext = <T>(
    companyId: string,
    callback: () => T,
): T => tenantStorage.run({ companyId }, callback);

export const getTenantCompanyId = (): string | undefined => (
    tenantStorage.getStore()?.companyId
);

