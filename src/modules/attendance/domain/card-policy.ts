/** بيانات أهلية إصدار البطاقة. */
export interface CardEligibility {
  manager: boolean;
  denied: boolean;
  approved: boolean;
  phone: boolean;
  card: boolean;
}
/** يتحقق من سياسة الإصدار المعتمدة دون إضعاف منع الصلاحيات. */
export function canIssueCard(input: CardEligibility): boolean {
  return input.manager && !input.denied && input.approved && !input.phone && !input.card;
}
