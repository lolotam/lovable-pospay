import { createServerFn } from "@tanstack/react-start";

export type MyCompany = { id: string; name: string; role: string };

// Companies the signed-in user belongs to. RLS (not this code) filters the rows.
export const getMyCompanies = createServerFn({ method: "GET" }).handler(async () => {
  const { requireUserId } = await import("./server/session.server");
  const { withUser } = await import("./server/db.server");
  const userId = await requireUserId();
  return withUser(userId, async (db) => {
    const { rows } = await db.query<MyCompany>(
      `select c.id, c.name, m.role::text as role
         from public.companies c join public.memberships m on m.company_id = c.id
        where m.user_id = $1 order by c.name`,
      [userId],
    );
    return rows;
  });
});

// Health check for the deployment: is the database reachable?
export const getSystemStatus = createServerFn({ method: "GET" }).handler(async () => {
  const configured = {
    database: Boolean(process.env["DATABASE_URL"]),
    auth: Boolean(process.env["BETTER_AUTH_SECRET"] && process.env["BETTER_AUTH_URL"]),
    whatsapp: Boolean(process.env["WHATSAPP_API_URL"]),
  };
  let databaseReachable = false;
  if (configured.database) {
    try {
      const { getPool } = await import("./server/db.server");
      await getPool().query("select 1");
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }
  return { ...configured, databaseReachable };
});
