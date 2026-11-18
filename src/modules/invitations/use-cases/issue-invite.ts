export interface IssueInviteDeps {
  save(): Promise<{ id: string; companyName: string }>;
  revoke(id: string): Promise<void>;
  send(url: string, companyName: string): Promise<boolean>;
}

/**
 * يصدر دعوة ويرسل رابطها إلى بريد المدعو فقط. الرابط لا يرجع للداعي أبداً،
 * لأن قبول الدعوة يوثّق البريد؛ لو فشل الإرسال تُلغى الدعوة.
 */
export async function issueInvite(deps: IssueInviteDeps, url: string): Promise<{ emailed: true }> {
  const saved = await deps.save();
  const emailed = await deps.send(url, saved.companyName).catch(() => false);
  if (!emailed) {
    await deps.revoke(saved.id);
    throw new Error("INVITE_EMAIL_NOT_SENT");
  }
  return { emailed: true };
}
