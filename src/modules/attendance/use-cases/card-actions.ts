import { canIssueCard, type CardEligibility } from "../domain/card-policy";
import type { CardRepository } from "../ports/card-repository";
import type { CardManagement, IssuedCard } from "../card.contracts";

/** يتحقق من أهلية الإصدار بعد قفل الموظفة وقراءة حالتها الحالية. */
export function requireCardEligibility(input: CardEligibility): void {
  if (!canIssueCard(input))
    throw new Error(input.phone ? "ACTIVE_PHONE" : input.card ? "ACTIVE_CARD" : "FORBIDDEN");
}

/** أدوات توليد وتجزئة رمز البطاقة. */
export interface CardTokens {
  generate(): string;
  hash(token: string): Promise<string>;
}

/** يصدر بطاقة لموظفة بعد القفل والتحقق من السياسة وعدم وجود طريقة فعالة أخرى. */
export async function issueCardUseCase(
  repo: CardRepository,
  tokens: CardTokens,
  staffId: string,
  check: (state: CardEligibility) => void = requireCardEligibility,
): Promise<IssuedCard> {
  const staff = await repo.lockStaff(staffId);
  const state = await repo.eligibility(staff);
  check({ ...state, manager: staff.manager, denied: false });
  const token = tokens.generate();
  const cardId = await repo.insertCard(staffId, await tokens.hash(token));
  await repo.audit("cards.issued", cardId, { staffId });
  return { token, name: staff.name, cardId };
}

/** يلغي بطاقة فورًا؛ المدير فقط وبعد قفل الموظفة. */
export async function revokeCardUseCase(repo: CardRepository, cardId: string): Promise<void> {
  const staffId = await repo.cardStaff(cardId);
  if (!staffId) throw new Error("FORBIDDEN");
  const staff = await repo.lockStaff(staffId);
  if (!staff.manager) throw new Error("FORBIDDEN");
  if (!(await repo.markRevoked(cardId))) throw new Error("CARD_REVOKED");
  await repo.audit("cards.revoked", cardId, {});
}

export async function loadCardManagement(repo: {
  access(): Promise<{ member: boolean; manager: boolean } | undefined>;
  read(): Promise<Omit<CardManagement, "canApprove">>;
}): Promise<CardManagement> {
  const access = await repo.access();
  if (!access?.member) throw new Error("FORBIDDEN");
  return { ...(await repo.read()), canApprove: access.manager };
}

export async function approveCardPolicy(repo: {
  insert(): Promise<boolean>;
  audit(): Promise<void>;
}): Promise<void> {
  if (await repo.insert()) await repo.audit();
}
