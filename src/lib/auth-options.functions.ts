import { createServerFn } from "@tanstack/react-start";

export const getSignInOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { isEmailRecoveryConfigured } = await import("@/lib/server/resend.server");
  return {
    google: Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]),
    emailOtp: isEmailRecoveryConfigured(),
  };
});
