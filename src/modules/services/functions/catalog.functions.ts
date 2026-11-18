import { loadCatalog, saveService } from "../use-cases/save-service";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { serviceScope, saveServiceInput } from "../contracts";
const catalogRequest = serviceScope.extend({ expectedUserId: z.string().min(1) });
const catalogSaveRequest = saveServiceInput
  .extend({ expectedUserId: z.string().min(1) })
  .refine((data) => !!(data.id || data.requestId));

export const getCatalogFn = createServerFn({ method: "GET" })
  .inputValidator((v: z.input<typeof catalogRequest>) => v)
  .handler(async ({ data: input }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { pgCatalogReader } = await import("../persistence/catalog.server");
    try {
      const userId = await requireUserId();
      const data = catalogRequest.parse(input);
      if (userId !== data.expectedUserId) return null;
      return await withUser(userId, (db) =>
        withPermission(db, data.companyId, "services.manage", () =>
          loadCatalog(pgCatalogReader(db, data.companyId)),
        ),
      );
    } catch (error) {
      if (error instanceof Error && ["FORBIDDEN", "UNAUTHENTICATED"].includes(error.message))
        return null;
      throw error;
    }
  });
export const saveServiceFn = createServerFn({ method: "POST" })
  .inputValidator((v: z.input<typeof catalogSaveRequest>) => v)
  .handler(async ({ data: input }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { pgCatalogWriter } = await import("../persistence/catalog.server");
    const userId = await requireUserId();
    const data = catalogSaveRequest.parse(input);
    if (userId !== data.expectedUserId) return { status: "unverified" as const };
    try {
      return {
        status: "saved" as const,
        ...(await withUser(userId, (db) =>
          withPermission(db, data.companyId, "services.manage", () =>
            saveService(pgCatalogWriter(db, userId, data.companyId), data),
          ),
        )),
      };
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN")
        return { status: "denied" as const };
      if (error instanceof Error && error.message === "SERVICE_REQUEST_CONFLICT")
        return { status: "rejected" as const };
      if (error instanceof Error && error.message === "SERVICE_INVALID_ASSIGNMENTS")
        return { status: "invalid_assignments" as const };
      if (error instanceof Error && error.message === "SERVICE_CONFLICT")
        return { status: "stale" as const };
      throw error;
    }
  });
