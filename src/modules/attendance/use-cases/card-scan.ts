import type { CardScanReceipts } from "../ports/card-scan-receipts";
import type { ScanInputDto } from "../contracts";
import type { AttendanceRepository, BranchInfo } from "../ports/attendance-repository";
import type { Clock } from "@/shared/kernel/clock";
import type { IdGenerator } from "@/shared/kernel/ids";
import { recordAttendance } from "./record-attendance";
/** يعيد نتيجة الطلب نفسه عند إعادة المحاولة من غير تسجيل حركة ثانية. */
export async function recordCardRequest<Result>(
  receipts: CardScanReceipts<Result>,
  fingerprint: string,
  record: () => Promise<Result>,
): Promise<Result> {
  const previous = await receipts.lockAndRead();
  if (previous) {
    if (previous.fingerprint !== fingerprint) throw new Error("CARD_REQUEST_CONFLICT");
    return previous.result;
  }

  const result = await record();
  await receipts.save({ fingerprint, result });
  return result;
}

/** يسترجع نتيجة طلب المسح، أو يحفظ إلغاءه إذا لم يُسجَّل بعد، لمنع تسجيل حركة جديدة. */
export async function settleCardRequest<Result>(
  receipts: CardScanReceipts<Result>,
  missing: () => Result,
): Promise<Result> {
  const previous = await receipts.lockAndRead();
  if (previous) return previous.result;
  const result = missing();
  await receipts.save({ fingerprint: null, result });
  return result;
}

/** يحسب صلاحية الاسترجاع مع سماح بخمس دقائق لفارق ساعة المتصفح. */
export function cardRequestWindow(requestedAt: number, now: number) {
  const clockSkew = 5 * 60_000;
  const age = now - requestedAt;
  if (age < -clockSkew) return "too_early";
  if (age >= 7 * 24 * 60 * 60_000 + clockSkew) return "expired";
  return "valid";
}

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
