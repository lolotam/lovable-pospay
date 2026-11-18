import { loadCatalog, saveService } from "../use-cases/save-service";
import { createServerFn } from "@tanstack/react-start";
import { serviceScope, saveServiceInput } from "../contracts";
export const getCatalogFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => serviceScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCatalogReader } = await import("../persistence/catalog.server");
    return withUser(await requireUserId(), (db) =>
      loadCatalog(pgCatalogReader(db, data.companyId)),
    );
  });
export const saveServiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    saveServiceInput.refine((data) => !!(data.id || data.requestId)).parse(v),
  )
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCatalogWriter } = await import("../persistence/catalog.server");
    const userId = await requireUserId();
    return withUser(userId, (db) => saveService(pgCatalogWriter(db, userId, data.companyId), data));
  });
