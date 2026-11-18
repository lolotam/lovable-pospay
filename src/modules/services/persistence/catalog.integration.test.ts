// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { pgCatalogReader, pgCatalogWriter } from "./catalog.server";
import { loadCatalog, saveService as saveCatalogService } from "../use-cases/save-service";

const url = process.env["POSPAY_TEST_DATABASE_URL"];
const company = "50000000-0000-0000-0000-000000000001";
const branch = "50000000-0000-0000-0000-000000000002";
const staff = "50000000-0000-0000-0000-000000000003";
const saveService = (
  db: pg.PoolClient,
  user: string,
  input: Parameters<typeof saveCatalogService>[1],
) => saveCatalogService(pgCatalogWriter(db, user, company), input);

describe.skipIf(!url)("service catalog under PostgreSQL RLS", () => {
  let admin: pg.Pool;
  beforeAll(async () => {
    if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/pospay_test")
      throw new Error("Disposable database required");
    vi.stubEnv("DATABASE_URL", url);
    admin = new pg.Pool({ connectionString: url });
    for (const file of ["0001_tenancy_foundation", "0002_attendance", "0012_service_catalog"]) {
      await admin.query(await readFile(`db/migrations/${file}.sql`, "utf8"));
    }
    await admin.query("insert into public.companies(id,name) values($1,'Catalog salon')", [
      company,
    ]);
    await admin.query("insert into public.branches(company_id,id,name) values($1,$2,'Branch')", [
      company,
      branch,
    ]);
    await admin.query(
      `insert into public.memberships(company_id,user_id,role,branch_id)
       values($1,'catalog-manager','branch_manager',$2),($1,'catalog-staff','staff',$2)`,
      [company, branch],
    );
    await admin.query(
      "insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values($1,$2,$3,'catalog-staff','Mona')",
      [company, staff, branch],
    );
  });
  afterAll(async () => {
    if (admin) {
      for (const table of ["service_assignments", "service_catalog", "audit_log"]) {
        await admin.query(`delete from public.${table} where company_id=$1`, [company]);
      }
      await admin.query("delete from public.companies where id=$1", [company]);
      await admin.end();
      await getPool().end();
    }
    vi.unstubAllEnvs();
  });
  it("catalog saves 25.125 exactly and assignment reads back", async () => {
    const c = await withUser("catalog-manager", (db) =>
      saveService(db, "catalog-manager", {
        companyId: company,
        name: "Hair",
        price: "25.125",
        staffIds: [staff],
      }),
    );
    const list = await withUser("catalog-manager", (db) =>
      loadCatalog(pgCatalogReader(db, company)),
    );
    expect(list.services.find((s) => s.id === c.id)).toMatchObject({
      priceMills: "25125",
      staffIds: [staff],
    });
  });
  it("retries a catalog creation without duplicating the entry or audit", async () => {
    const requestId = crypto.randomUUID();
    const input = {
      companyId: company,
      requestId,
      name: "Retry catalog",
      price: "20",
      staffIds: [staff],
    };
    const run = () =>
      withUser("catalog-manager", (db) => saveService(db, "catalog-manager", input));
    await expect(Promise.all([run(), run()])).resolves.toEqual([
      { id: requestId },
      { id: requestId },
    ]);
    for (const changed of [
      { ...input, price: "21" },
      { ...input, staffIds: [] },
    ]) {
      await expect(
        withUser("catalog-manager", (db) => saveService(db, "catalog-manager", changed)),
      ).rejects.toThrow("SERVICE_REQUEST_CONFLICT");
    }
    const catalog = await withUser("catalog-manager", (db) =>
      loadCatalog(pgCatalogReader(db, company)),
    );
    expect(catalog.services.find(({ id }) => id === requestId)).toMatchObject({
      priceMills: "20000",
      staffIds: [staff],
    });
    const audit = await admin.query(
      "select count(*)::int as count from public.audit_log where company_id=$1 and entity_id=$2 and action='service.saved'",
      [company, requestId],
    );
    expect(audit.rows[0]?.count).toBe(1);
  });
  it("staff cannot edit prices", async () => {
    await expect(
      withUser("catalog-staff", (db) =>
        saveService(db, "catalog-staff", {
          companyId: company,
          id: crypto.randomUUID(),
          version: 1,
          name: "Forbidden",
          price: "1.000",
          staffIds: [],
        }),
      ),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("catalog edit retains previous price and rejects stale version", async () => {
    const { id } = await withUser("catalog-manager", (db) =>
      saveService(db, "catalog-manager", {
        companyId: company,
        name: "Hair before update",
        price: "25.125",
        staffIds: [staff],
      }),
    );
    const list = await withUser("catalog-manager", (db) =>
      loadCatalog(pgCatalogReader(db, company)),
    );
    const service = list.services.find((row) => row.id === id);
    if (!service) throw new Error("Missing fixture");
    await withUser("catalog-manager", (db) =>
      saveService(db, "catalog-manager", {
        companyId: company,
        id: service.id,
        version: service.version,
        name: "Hair updated",
        price: "30.000",
        staffIds: [staff],
      }),
    );
    await expect(
      withUser("catalog-manager", (db) =>
        saveService(db, "catalog-manager", {
          companyId: company,
          id: service.id,
          version: service.version,
          name: "Stale",
          price: "1.000",
          staffIds: [],
        }),
      ),
    ).rejects.toThrow("SERVICE_CONFLICT");
    const audit = await admin.query(
      `select details from audit_log where company_id=$1 and action='service.saved' and details->>'name'='Hair updated'`,
      [company],
    );
    expect(audit.rows[0].details.previous.price_mills).toBe("25125");
  });
});
