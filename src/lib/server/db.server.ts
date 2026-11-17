// Server-only Postgres access to the self-hosted Supabase database.
// Every app query runs through withUser(): it opens a transaction, drops to the
// non-privileged `pospay_app` role and sets `app.user_id`, so RLS enforces
// company isolation in the database, not in application code.
import pg from "pg";

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function withUser<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("set local role pospay_app");
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
