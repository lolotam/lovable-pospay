import { createServerFn } from "@tanstack/react-start";
import {
  acceptInviteInput,
  createInviteInput,
  inviteScope,
  inviteTokenInput,
  revokeInviteInput,
} from "../contracts";

export const getTeamFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => inviteScope.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { readTeam } = await import("../persistence/invitation.server");
    return withUser(await requireUserId(), (db) =>
      withPermission(db, data.companyId, "staff.manage", () => readTeam(db, data.companyId)),
    );
  });

export const createInviteFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => createInviteInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { insertInvite, revokeInvite } = await import("../persistence/invitation.server");
    const { sendInvitationEmail } = await import("@/lib/server/resend.server");
    const { issueInvite } = await import("../use-cases/issue-invite");
    const { newInviteToken, hashInviteToken, inviteExpiry } =
      await import("../domain/invite-token");
    const userId = await requireUserId();
    const token = newInviteToken();
    const tokenHash = await hashInviteToken(token);
    const base = process.env["BETTER_AUTH_URL"] ?? "";
    const url = `${new URL(base).origin}/invite?t=${token}`;
    return issueInvite(
      {
        save: () =>
          withUser(userId, (db) =>
            withPermission(db, data.companyId, "staff.manage", () =>
              insertInvite(db, { ...data, tokenHash, expiresAt: inviteExpiry(new Date()), userId }),
            ),
          ),
        revoke: (id) =>
          withUser(userId, (db) =>
            withPermission(db, data.companyId, "staff.manage", () =>
              revokeInvite(db, data.companyId, id, userId),
            ),
          ),
        send: (link, companyName) => sendInvitationEmail(data.email, link, companyName),
      },
      url,
    );
  });

export const revokeInviteFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => revokeInviteInput.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { withPermission } = await import("@/modules/permissions/index.server");
    const { revokeInvite } = await import("../persistence/invitation.server");
    const userId = await requireUserId();
    await withUser(userId, (db) =>
      withPermission(db, data.companyId, "staff.manage", () =>
        revokeInvite(db, data.companyId, data.id, userId),
      ),
    );
    return { ok: true };
  });

export const previewInviteFn = createServerFn({ method: "GET" })
  .inputValidator((v: unknown) => inviteTokenInput.parse(v))
  .handler(async ({ data }) => {
    const { withUser } = await import("@/lib/server/db.server");
    const { previewInvite } = await import("../persistence/invitation.server");
    const { hashInviteToken } = await import("../domain/invite-token");
    const hash = await hashInviteToken(data.token);
    return withUser("", (db) => previewInvite(db, hash));
  });

export const acceptInviteFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => acceptInviteInput.parse(v))
  .handler(async ({ data }) => {
    const { withUser } = await import("@/lib/server/db.server");
    const { previewInvite, acceptInvite } = await import("../persistence/invitation.server");
    const { createInvitedAccount, deleteInvitedAccount } =
      await import("../persistence/account.server");
    const { hashInviteToken } = await import("../domain/invite-token");
    const hash = await hashInviteToken(data.token);
    const invite = await withUser("", (db) => previewInvite(db, hash));
    if (!invite) throw new Error("INVITE_INVALID");
    const userId = await createInvitedAccount(invite.email, data.name, data.password);
    try {
      await withUser(userId, (db) => acceptInvite(db, hash, invite.email));
    } catch (e) {
      await deleteInvitedAccount(userId).catch(() => {});
      throw e;
    }
    return { email: invite.email };
  });

export const acceptInviteAsSignedInFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => inviteTokenInput.parse(v))
  .handler(async ({ data }) => {
    const { requireSession } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { acceptInvite } = await import("../persistence/invitation.server");
    const { hashInviteToken } = await import("../domain/invite-token");
    const { setResponseHeader } = await import("@tanstack/react-start/server");
    const session = await requireSession();
    const hash = await hashInviteToken(data.token);
    setResponseHeader("Cache-Control", "private, no-store");
    const companyId = await withUser(session.user.id, (db) =>
      acceptInvite(db, hash, session.user.email),
    );
    return { companyId };
  });
