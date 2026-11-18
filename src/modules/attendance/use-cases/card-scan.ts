import type { ScanInputDto } from "../contracts";
import type { AttendanceRepository, BranchInfo } from "../ports/attendance-repository";
import type { Clock } from "@/shared/kernel/clock";
import type { IdGenerator } from "@/shared/kernel/ids";
import { recordAttendance } from "./record-attendance";
export interface CardScanContext {
  name: string;
  branch: BranchInfo;
  branchId: string;
  staffId: string;
  repo: AttendanceRepository;
}
/** يسجل حضور البطاقة بعد التحقق من صلاحية المشغّل والبطاقة داخل المعاملة. */
export async function recordCard(
  input: ScanInputDto,
  context: CardScanContext,
  clock: Clock,
  ids: IdGenerator,
) {
  const result = await recordAttendance(
    { ...input, token: "", location: null },
    context.branchId,
    context.branch,
    context.staffId,
    { repo: context.repo, clock, ids },
    clock.now(),
  );
  return { name: context.name, result };
}
