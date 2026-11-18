import type { CardEligibility } from "../domain/card-policy";

/** موظفة مقفولة داخل المعاملة مع صلاحية المدير الحالي عليها. */
export interface LockedCardStaff {
  id: string;
  name: string;
  userId: string;
  manager: boolean;
}

/** منفذ تخزين البطاقات؛ كل عملياته تعمل داخل معاملة المستخدم الحالي. */
export interface CardRepository {
  lockStaff(staffId: string): Promise<LockedCardStaff>;
  eligibility(staff: LockedCardStaff): Promise<Omit<CardEligibility, "manager" | "denied">>;
  insertCard(staffId: string, tokenHash: string): Promise<string>;
  cardStaff(cardId: string): Promise<string | null>;
  markRevoked(cardId: string): Promise<boolean>;
  audit(action: string, entityId: string, details: unknown): Promise<void>;
}
