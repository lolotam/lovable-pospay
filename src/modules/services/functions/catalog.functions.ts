import { loadCatalog, saveService } from "../use-cases/save-service";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { serviceScope, saveServiceInput } from "../contracts";
export const getCatalogFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) =>
    serviceScope.extend({ expectedUserId: z.string().min(1) }).parse(v),
  )
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCatalogReader } = await import("../persistence/catalog.server");
    try {
      const userId = await requireUserId();
      if (userId !== data.expectedUserId) return null;
      return await withUser(userId, (db) => loadCatalog(pgCatalogReader(db, data.companyId)));
    } catch (error) {
      if (error instanceof Error && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.message))
        return null;
      throw error;
    }
  });
export const saveServiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    saveServiceInput
      .extend({ expectedUserId: z.string().min(1) })
      .refine((data) => !!(data.id || data.requestId))
      .parse(v),
  )
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgCatalogWriter } = await import("../persistence/catalog.server");
    const userId = await requireUserId();
    if (userId !== data.expectedUserId) return { status: "unverified" as const };
    try {
      return {
        status: "saved" as const,
        ...(await withUser(userId, (db) =>
          saveService(pgCatalogWriter(db, userId, data.companyId), data),
        )),
      };
    } catch (error) {
      if (
        error instanceof Error &&
        ["FORBIDDEN", "SERVICE_REQUEST_CONFLICT"].includes(error.message)
      )
        return { status: "rejected" as const };
      if (error instanceof Error && error.message === "SERVICE_CONFLICT")
        return { status: "stale" as const };
      throw error;
    }
  });
