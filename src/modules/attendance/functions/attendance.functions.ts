import { createServerFn } from "@tanstack/react-start";
import {
  branchQrInputSchema,
  protectedScanSchema,
  scanQrBranchId,
  type BranchQrDto,
  type ScanResultDto,
} from "../contracts";

export const scanAttendanceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => protectedScanSchema.parse(input))
  .handler(async ({ data }): Promise<ScanResultDto> => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgAttendanceRepository } = await import("../persistence/attendance-repository.server");
    const { branchSigner } = await import("../persistence/qr-signer.server");
    const { scanAttendance } = await import("../use-cases/scan-attendance");
    const { systemClock } = await import("@/shared/kernel/clock");
    const { cryptoIds } = await import("@/shared/kernel/ids");
    const userId = await requireUserId();
    const branchId = scanQrBranchId(data.token);
    if (!branchId) return { outcome: "rejected", reason: "invalid_qr" };
    const { prove, requirePhone } = await import("@/modules/staff/index.server");
    return withUser(userId, async (db) => {
      const credentialId = await prove(db, userId, data, "scan");
      await requirePhone(db, userId, data.companyId, credentialId);
      const branch = await db.query("select company_id from public.branches where id=$1", [
        branchId,
      ]);
      if (branch.rows[0]?.company_id !== data.companyId) throw new Error("FORBIDDEN");
      return scanAttendance(data, {
        repo: pgAttendanceRepository(db, userId),
        clock: systemClock,
        ids: cryptoIds,
        signerFor: (id) => (id === branchId ? branchSigner(db, id) : Promise.resolve(null)),
      });
    });
  });

export const scanChallengeFn = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => branchQrInputSchema.parse(v))
  .handler(async ({ data }) => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { challenge } = await import("@/modules/staff/index.server");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      const r = await db.query("select company_id from public.branches where id=$1", [
        data.branchId,
      ]);
      if (!r.rows[0]) throw new Error("FORBIDDEN");
      const companyId = r.rows[0].company_id as string;
      return { ...(await challenge(db, userId, companyId, "scan")), companyId };
    });
  });

export const getBranchQrFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => branchQrInputSchema.parse(input))
  .handler(async ({ data }): Promise<BranchQrDto> => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { branchSigner } = await import("../persistence/qr-signer.server");
    const { issueQrToken, QR_TTL_SECONDS } = await import("../domain/qr-token");
    const userId = await requireUserId();
    return withUser(userId, async (db) => {
      const { rows } = await db.query(
        `select b.name from public.branches b
          where b.id = $1 and public.has_permission(b.company_id, 'pos.access') and (public.is_company_admin(b.company_id) or public.has_company_role(b.company_id, 'reception'))`,
        [data.branchId],
      );
      const signer = rows[0] ? await branchSigner(db, data.branchId) : null;
      if (!rows[0] || !signer) throw new Error("FORBIDDEN");
      const token = await issueQrToken(data.branchId, Math.floor(Date.now() / 1000), signer);
      return { token, branchName: rows[0].name as string, expiresInSeconds: QR_TTL_SECONDS };
    });
  });
