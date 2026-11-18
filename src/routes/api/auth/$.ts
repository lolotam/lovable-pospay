import { createFileRoute } from "@tanstack/react-router";

async function handle({ request }: { request: Request }) {
  if (!process.env["DATABASE_URL"] || !process.env["BETTER_AUTH_SECRET"]) {
    return Response.json(
      { code: "AUTH_NOT_CONFIGURED", message: "Sign-in is not configured on this server." },
      { status: 503 },
    );
  }
  const { getAuth } = await import("@/lib/server/auth.server");
  return getAuth().handler(request);
}

export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
