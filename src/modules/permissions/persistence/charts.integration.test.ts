// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import pg from "pg";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "91000000-0000-4000-8000-000000000001",
  branch = "91000000-0000-4000-8000-000000000002",
  staff = "91000000-0000-4000-8000-000000000003",
  otherBranch = "91000000-0000-4000-8000-000000000004",
  otherStaff = "91000000-0000-4000-8000-000000000005",
  service = "91000000-0000-4000-8000-000000000006",
  client = "91000000-0000-4000-8000-000000000007",
  session = "91000000-0000-4000-8000-000000000008";
describe.skipIf(!url)("D1 dashboard SQL with disposable RLS", () => {
  let pool: pg.Pool;
  beforeAll(async () => {
    if (
      !url ||
      !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
      new URL(url).pathname !== "/pospay_test"
    )
      throw new Error("Disposable localhost pospay_test required");
    pool = new pg.Pool({ connectionString: url });
    for (let pass = 0; pass < 2; pass++)
      for (const file of (await readdir("db/migrations"))
        .filter((f) => /^\d{4}_.*\.sql$/.test(f))
        .sort())
        await pool.query(await readFile(`db/migrations/${file}`, "utf8"));
  });
  afterAll(async () => {
    if (pool) await pool.end();
  });
  async function read(user: string, sql: string, fixture: "attendance" | "session" = "attendance") {
    const db = await pool.connect();
    try {
      await db.query("begin");
      await db.query("insert into public.companies(id,name) values($1,'D1')", [company]);
      await db.query(
        "insert into public.branches(id,company_id,name) values($1,$3,'A'),($2,$3,'B')",
        [branch, otherBranch, company],
      );
      await db.query(
        "insert into public.memberships(company_id,user_id,role,branch_id) values($1,'d1-owner','owner',null),($1,'d1-manager','branch_manager',$2),($1,'d1-staff','staff',$2)",
        [company, branch],
      );
      await db.query(
        "insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values($1,$2,$3,'d1-staff','Staff'),($1,$4,$5,'d1-other','Other')",
        [company, staff, branch, otherStaff, otherBranch],
      );
      await db.query(
        `insert into public.attendance_records(id,company_id,staff_id,branch_id,work_date,check_in_at,late_minutes) values
          (gen_random_uuid(),$1,$2,$3,'2026-11-01','2026-11-01T08:00Z',12),
          (gen_random_uuid(),$1,$4,$5,'2026-11-01','2026-11-01T08:00Z',20)`,
        [company, staff, branch, otherStaff, otherBranch],
      );
      if (fixture === "session") {
        await db.query(
          "insert into public.service_catalog(company_id,id,name,price_mills) values($1,$2,'Hair',12500)",
          [company, service],
        );
        await db.query(
          "insert into public.clients(company_id,id,name,phone) values($1,$2,'Noura','96555551234')",
          [company, client],
        );
        await db.query(
          `insert into public.service_sessions(company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,price_mills,recorded_by,list_price_mills)
           values($1,$2,$3,$4,$5,$6,'2026-11-01T10:00Z','Hair',12500,'d1-owner',12500)`,
          [company, session, service, staff, branch, client],
        );
      }
      await db.query("set local role pospay_app");
      await db.query("select set_config('app.user_id',$1,true)", [user]);
      return (await db.query(sql)).rows;
    } finally {
      await db.query("rollback");
      db.release();
    }
  }
  it("returns 14 days with zero padding", async () => {
    const rows = await read(
      "d1-owner",
      `select * from public.attendance_daily('${company}',null,'2026-11-01','2026-11-14')`,
    );
    expect(rows).toHaveLength(14);
    expect(rows[0].late).toBe(2);
    expect(rows[1].on_time).toBe(0);
  });
  it("narrows a branch manager to their own branch", async () => {
    const all = await read(
      "d1-manager",
      `select * from public.attendance_daily('${company}',null,'2026-11-01','2026-11-14')`,
    );
    expect(all).toHaveLength(14);
    expect(all[0].late).toBe(1);
    expect(
      await read(
        "d1-manager",
        `select * from public.attendance_daily('${company}','${otherBranch}','2026-11-01','2026-11-14')`,
      ),
    ).toHaveLength(0);
  });
  it("refuses staff reporting", async () => {
    expect(
      await read(
        "d1-staff",
        `select * from public.attendance_daily('${company}',null,'2026-11-01','2026-11-14')`,
      ),
    ).toHaveLength(0);
  });
  it("returns the recorded session count and exact daily revenue", async () => {
    const rows = await read(
      "d1-owner",
      `select day::text,sessions,revenue_mills::text from public.session_daily('${company}',null,'2026-11-01','2026-11-01')`,
      "session",
    );
    expect(rows).toEqual([{ day: "2026-11-01", sessions: 1, revenue_mills: "12500" }]);
  });
  it("refuses non-admin growth", async () => {
    expect(await read("d1-owner", "select * from public.platform_growth(12)")).toHaveLength(0);
  });
});
