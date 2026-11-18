import type { Clock } from "@/shared/kernel/clock";
import type { IdGenerator } from "@/shared/kernel/ids";
import type { ScanInputDto, ScanResultDto } from "../contracts";
import { locationException } from "../domain/geofence";
import { qrBranchId, verifyQrToken, type Signer } from "../domain/qr-token";
import { decideScan, lateMinutes, workDate, type ShiftWindow } from "../domain/scan-decision";
import type { AttendanceRepository, BranchInfo } from "../ports/attendance-repository";

export interface ScanDeps {
  repo: AttendanceRepository;
  clock: Clock;
  ids: IdGenerator;
  signerFor: (branchId: string) => Promise<Signer | null>;
}

export async function scanAttendance(input: ScanInputDto, deps: ScanDeps): Promise<ScanResultDto> {
  const now = deps.clock.now();
  const branchId = qrBranchId(input.token);
  const signer = branchId ? await deps.signerFor(branchId) : null;
  const payload = signer
    ? await verifyQrToken(input.token, Math.floor(now.getTime() / 1000), signer)
    : null;
  const branch = payload ? await deps.repo.branch(payload.branchId) : null;
  if (!payload || !branch) return { outcome: "rejected", reason: "invalid_qr" };

  const staffId = await deps.repo.myStaffId(branch.companyId);
  if (!staffId) return { outcome: "rejected", reason: "not_staff" };

  const exception = locationException(input.location, branch.location, branch.geofenceMeters);
  const open = await deps.repo.openRecord(branch.companyId, staffId);
  const nextShift = await deps.repo.nextShift(branch.companyId, staffId, now);
  const decision = decideScan({ now, open, nextShift, intent: input.intent });

  switch (decision.kind) {
    case "needs_intent":
      return { outcome: "needs_intent" };
    case "check_out":
      await deps.repo.close(branch.companyId, decision.recordId, now, decision.status, exception);
      await deps.repo.audit(branch.companyId, "attendance.check_out", decision.recordId, {
        status: decision.status,
        exception,
      });
      return { outcome: "checked_out", status: decision.status, exception };
    case "forgotten_then_check_in":
      await deps.repo.markForgotten(branch.companyId, decision.forgottenId);
      await deps.repo.audit(branch.companyId, "attendance.forgotten", decision.forgottenId, {});
      return checkIn(payload.branchId, branch, staffId, decision.shift, exception, deps, now);
    case "check_in":
      return checkIn(payload.branchId, branch, staffId, decision.shift, exception, deps, now);
  }
}

async function checkIn(
  branchId: string,
  branch: BranchInfo,
  staffId: string,
  shift: ShiftWindow | null,
  exception: ReturnType<typeof locationException>,
  deps: ScanDeps,
  now: Date,
): Promise<ScanResultDto> {
  const id = deps.ids.next();
  const late = lateMinutes(now, shift);
  await deps.repo.insertCheckIn(branch.companyId, {
    id,
    staffId,
    branchId,
    shiftId: shift?.id ?? null,
    workDate: workDate(now, branch.timeZone),
    checkInAt: now,
    lateMinutes: late,
    exception,
  });
  await deps.repo.audit(branch.companyId, "attendance.check_in", id, { late, exception });
  return { outcome: "checked_in", lateMinutes: late, exception };
}
