// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { readPhoneManagement } from "./phone-management.server";
import { bindPhone, getPhoneDeviceHash } from "./phone.server";

const browser = vi.hoisted(() => ({ token: undefined as string | undefined }));
vi.mock("@tanstack/react-start/server", () => ({
  getCookie: (name: string) => (name === "pospay-phone" ? browser.token : undefined),
  setCookie: (name: string, token: string) => {
    if (name === "pospay-phone") browser.token = token;
  },
}));
vi.mock("@/lib/server/auth.server", () => ({}));

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "10000000-0000-0000-0000-000000000001";
const foreign = "10000000-0000-0000-0000-000000000002";
const branch = "10000000-0000-0000-0000-000000000003";

describe.skipIf(!url)("phone management under company RLS", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url) throw new Error("POSPAY_TEST_DATABASE_URL required");
    const parsed = new URL(url);
    if (parsed.hostname !== "127.0.0.1" || parsed.pathname !== "/pospay_test") {
      throw new Error("Disposable localhost pospay_test required");
    }
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("BETTER_AUTH_URL", "https://example.test");
    admin = new pg.Pool({ connectionString: url });
    for (let pass = 0; pass < 2; pass++) {
      for (const file of [
        "0001_tenancy_foundation.sql",
        "0002_attendance.sql",
        "0003_phone_binding.sql",
      ]) {
        await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
      }
    }
    await admin.query(
      `insert into public.companies (id,name) values ($1,'Salon A'),($2,'Salon B')`,
      [company, foreign],
    );
    await admin.query(
      `insert into public.branches (id,company_id,name) values ($1,$2,'Branch A')`,
      [branch, company],
    );
    await admin.query(
      `insert into public.memberships (company_id,user_id,role) values
      ($1,'selector-owner','owner'),($1,'selector-staff','staff'),($1,'selector-denied','branch_manager')`,
      [company],
    );
    await admin.query(
      `insert into public.staff_members (company_id,branch_id,user_id,display_name)
      values ($1,$2,'selector-staff','Mona')`,
      [company, branch],
    );
    await admin.query(
      `insert into public.phone_bindings (company_id,user_id,credential_id,device_hash)
      values ($1,'selector-staff','private-credential','private-device')`,
      [company],
    );
    await admin.query(
      `insert into public.permission_overrides (company_id,user_id,permission,effect)
      values ($1,'selector-denied','attendance.manage_devices','deny'),($1,'selector-staff','attendance.record','deny')`,
      [company],
    );
  });
  afterAll(async () => {
    if (admin) {
      await admin.query("delete from public.companies where id in ($1,$2)", [company, foreign]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("owner sees linked staff by name without device secrets", async () => {
    expect(
      await withUser("selector-owner", (db) => readPhoneManagement(db, "selector-owner", company)),
    ).toEqual({
      canBind: false,
      isBound: false,
      browserBinding: null,
      canManage: true,
      staff: [
        { userId: "selector-staff", displayName: "Mona", branchName: "Branch A", isBound: true },
      ],
    });
  });
  it("foreign company identifiers fail closed", async () => {
    await expect(
      withUser("selector-owner", (db) => readPhoneManagement(db, "selector-owner", foreign)),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("staff cannot list other employees and attendance deny blocks binding", async () => {
    expect(
      await withUser("selector-staff", (db) => readPhoneManagement(db, "selector-staff", company)),
    ).toEqual({
      canBind: false,
      isBound: true,
      browserBinding: null,
      canManage: false,
      staff: [],
    });
  });
  it("manager deny overrides the role permission", async () => {
    expect(
      await withUser("selector-denied", (db) =>
        readPhoneManagement(db, "selector-denied", company),
      ),
    ).toEqual({
      canBind: false,
      isBound: false,
      browserBinding: null,
      canManage: false,
      staff: [],
    });
  });

  it("shows one browser binding across a staff member's two companies", async () => {
    const userId = "selector-two-companies";
    const secondBranch = "10000000-0000-0000-0000-000000000004";
    await admin.query(
      "insert into public.branches (id,company_id,name) values ($1,$2,'Branch B')",
      [secondBranch, foreign],
    );
    await admin.query(
      "insert into public.memberships (company_id,user_id,role) values ($1,$3,'staff'),($2,$3,'staff')",
      [company, foreign, userId],
    );
    await admin.query(
      "insert into public.staff_members (company_id,branch_id,user_id,display_name) values ($1,$3,$5,'Rana'),($2,$4,$5,'Rana')",
      [company, foreign, branch, secondBranch, userId],
    );
    const read = async (companyId: string, actor = userId) => {
      const deviceHash = await getPhoneDeviceHash();
      return withUser(actor, (db) => readPhoneManagement(db, actor, companyId, deviceHash));
    };
    expect(await read(company)).toMatchObject({ canBind: true, browserBinding: null });
    expect(await read(foreign)).toMatchObject({ canBind: true, browserBinding: null });

    await withUser(userId, (db) => bindPhone(db, userId, foreign, "owned-credential"));
    const browserBinding = { companyId: foreign, companyName: "Salon B" };
    expect(await read(foreign)).toMatchObject({ isBound: true, canBind: false, browserBinding });
    expect(await read(company)).toMatchObject({ isBound: false, canBind: false, browserBinding });
    expect(await read(company, "selector-owner")).toMatchObject({ browserBinding: null });
    await expect(
      withUser(userId, (db) => bindPhone(db, userId, company, "owned-credential")),
    ).rejects.toMatchObject({ code: "23505" });
    browser.token = undefined;
  });
});
