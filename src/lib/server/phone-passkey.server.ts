import { APIError } from "better-auth/api";

/** يتحقق بعد توقيع WebAuthn وقبل إنشاء الجلسة من ملكية الهاتف وعضوية الشركة الحالية. */
export async function assertBoundPhonePasskey(credentialId: string): Promise<void> {
  const { getAuth } = await import("./auth.server");
  const { withUser } = await import("./db.server");
  const ctx = await getAuth().$context;
  const credential = await ctx.adapter.findOne<{ userId: string }>({
    model: "passkey",
    where: [{ field: "credentialID", value: credentialId }],
  });
  if (!credential) throw new APIError("UNAUTHORIZED", { message: "Authentication failed" });
  const allowed = await withUser(credential.userId, async (db) => {
    const { rows } = await db.query<{ allowed: boolean }>(
      `select exists (select 1 from public.phone_bindings p
        where p.user_id=$1 and p.credential_id=$2 and public.is_member(p.company_id)) as allowed`,
      [credential.userId, credentialId],
    );
    return rows[0]?.allowed === true;
  });
  if (!allowed) throw new APIError("UNAUTHORIZED", { message: "Authentication failed" });
}

/** يحذف مفتاح الهاتف المفصول بواسطة محول Better Auth، وليس باستعلام هوية مباشر. */
export async function deletePhonePasskey(credentialId: string): Promise<void> {
  const { getAuth } = await import("./auth.server");
  const ctx = await getAuth().$context;
  await ctx.adapter.deleteMany({
    model: "passkey",
    where: [{ field: "credentialID", value: credentialId }],
  });
}
