import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  listMemberPermissionsInput,
  memberPermissionsSchema,
  saveOverridesInput,
} from "../contracts";
import { listMemberPermissions } from "../use-cases/list-member-permissions";
import { saveMemberOverrides } from "../use-cases/save-member-overrides";

export const listMemberPermissionsFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listMemberPermissionsInput.parse(input))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const actorId = await requireUserId();
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgPermissionAdminRepository } = await import("../persistence/permission-admin.server");
    return z
      .array(memberPermissionsSchema)
      .parse(
        await withUser(actorId, (db) =>
          listMemberPermissions(pgPermissionAdminRepository(db, actorId), data.companyId),
        ),
      );
  });
export const saveMemberOverridesFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => saveOverridesInput.parse(input))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const actorId = await requireUserId();
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    setResponseHeader("Cache-Control", "private, no-store");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgPermissionAdminRepository } = await import("../persistence/permission-admin.server");
    return memberPermissionsSchema.parse(
      await withUser(actorId, (db) =>
        saveMemberOverrides(pgPermissionAdminRepository(db, actorId), actorId, data),
      ),
    );
  });
