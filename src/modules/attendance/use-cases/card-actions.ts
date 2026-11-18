import { canIssueCard } from "../domain/card-policy";
/** يتحقق من أهلية الإصدار بعد قفل الموظفة وقراءة حالتها الحالية. */
export function requireCardEligibility(input: Parameters<typeof canIssueCard>[0]): void {
  if (!canIssueCard(input))
    throw new Error(input.phone ? "ACTIVE_PHONE" : input.card ? "ACTIVE_CARD" : "FORBIDDEN");
}
