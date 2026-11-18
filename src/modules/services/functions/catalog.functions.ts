import { servicePrice } from "../use-cases/service-price";
import { createServerFn } from "@tanstack/react-start";
import { serviceScope, saveServiceInput } from "../contracts";
export const getCatalogFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { readCatalog } = await import("../persistence/catalog.server");
    return withUser(await requireUserId(), (db) => readCatalog(db, data.companyId));
  });
export const saveServiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    saveServiceInput.refine((data) => !!(data.id || data.requestId)).parse(v),
  )
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { saveService } = await import("../persistence/catalog.server");
    const userId = await requireUserId();
    return withUser(userId, (db) => saveService(db, userId, data, servicePrice(data.price)));
  });
