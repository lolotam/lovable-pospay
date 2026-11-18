import type { Clock } from "@/shared/kernel/clock";
import type { IdGenerator } from "@/shared/kernel/ids";
import type { ScanInputDto, ScanResultDto } from "../contracts";
import { recordAttendance } from "./record-attendance";
import { qrBranchId, verifyQrToken, type Signer } from "../domain/qr-token";
import type { AttendanceRepository } from "../ports/attendance-repository";

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

  return recordAttendance(input, payload.branchId, branch, staffId, deps, now);
}
