// Test-only fixture helpers for the 021 commissions-builder integration tests.
import { readFile } from "node:fs/promises";
import { vi } from "vitest";
import pg from "pg";
import { getPool } from "@/lib/server/db.server";
import { parseKwdToMills } from "../domain/parse";

export const company = "21000000-0000-4000-8000-000000000001";
export const branch1 = "21000000-0000-4000-8000-000000000002";
export const branch2 = "21000000-0000-4000-8000-000000000003";
export const staff1 = "21000000-0000-4000-8000-000000000004";
export const staff2 = "21000000-0000-4000-8000-000000000005";
export const serviceA = "21000000-0000-4000-8000-000000000006";
export const serviceB = "21000000-0000-4000-8000-000000000007";
export const owner = "c021-owner";
export const manager1 = "c021-manager-1";
export const manager2 = "c021-manager-2";
export const reception = "c021-reception";
export const january = { year: 2027, month: 1 };
export const february = { year: 2027, month: 2 };
export const march = { year: 2027, month: 3 };

/** يسجل جلسة مباشرة كجهاز؛ للقراءة عبر RLS لاحقاً فقط. */
export async function insertSession(
  admin: pg.Pool,
  input: {
    id: string;
    serviceId: string;
    staffId: string;
    branchId: string;
    occurredAt: string;
    price: string;
  },
): Promise<void> {
  await admin.query(
    `with client as (
       insert into public.clients(company_id,name,phone)
       values($1,'Client','96550003333')
       on conflict (company_id,phone) do update set name=excluded.name
       returning id
     )
     insert into public.service_sessions(
       company_id,id,service_id,staff_id,branch_id,client_id,occurred_at,service_name,
       price_mills,recorded_by,list_price_mills,request_fingerprint
     )
     select $1,$2,$3,$4,$5,(select id from client),
       $6::timestamptz,c.name,$7,$8,$7,public.session_request_fingerprint('{}')
     from public.service_catalog c where c.company_id=$1 and c.id=$3`,
    [
      company,
      input.id,
      input.serviceId,
      input.staffId,
      input.branchId,
      input.occurredAt,
      parseKwdToMills(input.price).toString(),
      owner,
    ],
  );
}

/** يطبق الهجرات مرتين ويبني شركة الأجهزة بفرع الكويت وفرع UTC. */
export async function setupCommissions(): Promise<pg.Pool> {
  const url = process.env["POSPAY_TEST_DATABASE_URL"];
  if (
    !url ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/pospay_test"
  )
    throw new Error("Disposable localhost pospay_test required");
  vi.stubEnv("DATABASE_URL", url);
  const admin = new pg.Pool({ connectionString: url });
  for (const file of [
    "0001_tenancy_foundation",
    "0002_attendance",
    "0003_phone_binding",
    "0008_phone_binding_lock",
    "0009_attendance_branch_company",
    "0012_service_catalog",
    "0013_service_sessions",
    "0014_discount_grants",
    "0016_discount_grant_membership",
    "0023_session_recording",
    "0024_commission_plans",
    "0025_session_controls",
    "0026_commission_methods_and_salaries",
  ]) {
    const sql = await readFile(`db/migrations/${file}.sql`, "utf8");
    for (let pass = 0; pass < 2; pass++) await admin.query(sql);
  }
  await admin.query("insert into public.companies(id,name) values($1,'Builder salon')", [company]);
  await admin.query(
    `insert into public.branches(id,company_id,name,timezone)
     values($1,$2,'Kuwait branch','Asia/Kuwait'),($3,$2,'UTC branch','UTC')`,
    [branch1, company, branch2],
  );
  await admin.query(
    `insert into public.memberships(company_id,user_id,role,branch_id) values
     ($1,$2,'owner',null),($1,$3,'branch_manager',$4),($1,$5,'branch_manager',$6),($1,$7,'reception',$4)`,
    [company, owner, manager1, branch1, manager2, branch2, reception],
  );
  await admin.query(
    `insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values
     ($1,$2,$3,$4,'Huda'),($1,$5,$6,$7,'Salma')`,
    [company, staff1, branch1, "c021-staff-1", staff2, branch2, "c021-staff-2"],
  );
  await admin.query(
    `insert into public.service_catalog(company_id,id,name,price_mills) values
     ($1,$2,'Service A',50000),($1,$3,'Service B',100000)`,
    [company, serviceA, serviceB],
  );
  await admin.query(
    `insert into public.service_assignments(company_id,service_id,staff_id)
     values($1,$2,$3),($1,$4,$3),($1,$2,$5),($1,$4,$5)`,
    [company, serviceA, staff1, serviceB, staff2],
  );
  return admin;
}

/** يحذف بيانات شركة الأجهزة ويغلق المجموعتين. */
export async function cleanupCommissions(admin: pg.Pool): Promise<void> {
  for (const table of [
    "audit_log",
    "staff_salaries",
    "service_commission_overrides",
    "commission_plan_tiers",
    "staff_commission_plans",
    "commission_plan_versions",
    "commission_plans",
    "service_sessions",
    "clients",
    "service_assignments",
    "service_catalog",
    "staff_members",
    "memberships",
    "branches",
    "permission_overrides",
  ])
    await admin.query(`delete from public.${table} where company_id=$1`, [company]);
  await admin.query("delete from public.companies where id=$1", [company]);
  await admin.end();
  await getPool().end();
}
