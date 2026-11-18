// @vitest-environment node
import { readFile, readdir } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { listQrBranches, qrBranchName } from "./qr-branches.server";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const companyId = "71000000-0000-4000-8000-000000000001",
  north = "71000000-0000-4000-8000-000000000002",
  south = "71000000-0000-4000-8000-000000000003";
describe.skipIf(!url)("QR branch access under real withUser RLS", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable localhost pospay_test required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    const files = (await readdir("db/migrations")).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    for (const file of files) await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
    await admin.query(`insert into public.companies(id,name) values($1,'QR salon')`, [companyId]);
    await admin.query(
      `insert into public.branches(id,company_id,name) values($1,$3,'North'),($2,$3,'South')`,
      [north, south, companyId],
    );
    await admin.query(
      `insert into public.memberships(company_id,user_id,role,branch_id) values
        ($1,'qr-owner','owner',null),($1,'qr-manager','branch_manager',$2),($1,'qr-staff','staff',null)`,
      [companyId, north],
    );
    await admin.query(
      `insert into public.permission_overrides(company_id,user_id,permission,effect) values
        ($1,'qr-manager','pos.access','allow')`,
      [companyId],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id=$1", [companyId]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it.each([
    ["qr-owner", ["North", "South"]],
    ["qr-manager", ["North"]],
    ["qr-staff", []],
  ])("lists only the branches %s may show a QR for", async (userId, names) => {
    const rows = await withUser(userId, (db) => listQrBranches(db, companyId));
    expect(rows.map((r) => r.name)).toEqual(names);
  });
  it("refuses a branch-scoped manager the QR of another branch", async () => {
    expect(await withUser("qr-manager", (db) => qrBranchName(db, south))).toBeNull();
    expect(await withUser("qr-manager", (db) => qrBranchName(db, north))).toBe("North");
  });
});
