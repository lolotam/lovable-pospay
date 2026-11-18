import { createServerFn } from "@tanstack/react-start";

export const getSignInOptions = createServerFn({ method: "GET" }).handler(() => ({
  google: Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]),
  emailOtp: Boolean(
    process.env["LOVABLE_API_KEY"] &&
    process.env["RESEND_API_KEY"] &&
    process.env["BETTER_AUTH_URL"],
  ),
}));
