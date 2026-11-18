import type { Clock } from "@/shared/kernel/clock";
import type { IdGenerator } from "@/shared/kernel/ids";
import type { ScanInputDto, ScanResultDto } from "../contracts";
import { locationException } from "../domain/geofence";
import { decideScan, lateMinutes, workDate, type ShiftWindow } from "../domain/scan-decision";
import type { AttendanceRepository, BranchInfo } from "../ports/attendance-repository";
export interface RecordDeps {
  repo: AttendanceRepository;
  clock: Clock;
  ids: IdGenerator;
}
export async function recordAttendance(
  input: ScanInputDto,
  branchId: string,
  branch: BranchInfo,
  staffId: string,
  deps: RecordDeps,
  now: Date,
): Promise<ScanResultDto> {
  const exception = locationException(input.location, branch.location, branch.geofenceMeters);
  const open = await deps.repo.openRecord(branch.companyId, staffId);
  if (input.intent !== null && (!open || input.promptedRecordId !== open.id)) {
    return { outcome: "rejected", reason: "stale_intent" };
  }
  const nextShift = await deps.repo.nextShift(branch.companyId, staffId, now);
  const withoutIntent = decideScan({ now, open, nextShift, intent: null });
  if (input.intent === "new_shift" && withoutIntent.kind !== "needs_intent") {
    return { outcome: "rejected", reason: "stale_intent" };
  }
  const decision =
    input.intent === null
      ? withoutIntent
      : decideScan({ now, open, nextShift, intent: input.intent });
  if (input.intent === "check_out" && decision.kind !== "check_out") {
    return { outcome: "rejected", reason: "stale_intent" };
  }

  switch (decision.kind) {
    case "needs_intent":
      return { outcome: "needs_intent", recordId: decision.recordId };
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
      return checkIn(branchId, branch, staffId, decision.shift, exception, deps, now);
    case "check_in":
      return checkIn(branchId, branch, staffId, decision.shift, exception, deps, now);
  }
}

async function checkIn(
  branchId: string,
  branch: BranchInfo,
  staffId: string,
  shift: ShiftWindow | null,
  exception: ReturnType<typeof locationException>,
  deps: RecordDeps,
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
