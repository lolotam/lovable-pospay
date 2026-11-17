import { createServerFn } from "@tanstack/react-start";
import { branchQrInputSchema, scanInputSchema, type BranchQrDto, type ScanResultDto } from "../contracts";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export const scanAttendanceFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => scanInputSchema.parse(input))
  .handler(async ({ data }): Promise<ScanResultDto> => {
    const { requireUserId } = await import("@/lib/server/session.server");
    const { withUser } = await import("@/lib/server/db.server");
    const { pgAttendanceRepository } = await import("../persistence/attendance-repository.server");
    const { branchSigner } = await import("../persistence/qr-signer.server");
    const { scanAttendance } = await import("../use-cases/scan-attendance");
    const { systemClock } = await import("@/shared/kernel/clock");
    const { cryptoIds } = await import("@/shared/kernel/ids");
    const userId = await requireUserId();
    return withUser(userId, (db) =>
      scanAttendance(data, {
        repo: pgAttendanceRepository(db, userId),
        clock: systemClock,
        ids: cryptoIds,
        signerFor: (branchId) => (UUID_RE.test(branchId) ? branchSigner(db, branchId) : Promise.resolve(null)),
      }),
    );
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
          where b.id = $1 and (public.is_company_admin(b.company_id) or public.has_company_role(b.company_id, 'reception'))`,
        [data.branchId],
      );
      const signer = rows[0] ? await branchSigner(db, data.branchId) : null;
      if (!rows[0] || !signer) throw new Error("FORBIDDEN");
      const token = await issueQrToken(data.branchId, Math.floor(Date.now() / 1000), signer);
      return { token, branchName: rows[0].name as string, expiresInSeconds: QR_TTL_SECONDS };
    });
  });
