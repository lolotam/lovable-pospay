import { getAuth } from "@/lib/server/auth.server";

/** ينشئ حساب Better Auth لصاحب دعوة صالحة فقط؛ البريد موثّق لأن الرابط وصله عليه. */
export async function createInvitedAccount(email: string, name: string, password: string) {
  const ctx = await getAuth().$context;
  if (await ctx.internalAdapter.findUserByEmail(email)) throw new Error("ACCOUNT_EXISTS");
  const user = await ctx.internalAdapter.createUser(
    { email, name, emailVerified: true },
    { method: "invitation" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });
  return user.id;
}

export async function deleteInvitedAccount(userId: string) {
  const ctx = await getAuth().$context;
  await ctx.internalAdapter.deleteUser(userId);
}
