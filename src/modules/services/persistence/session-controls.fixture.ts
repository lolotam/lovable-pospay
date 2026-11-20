// Test-only fixture helpers for the 020 session-controls integration tests.
import { readFile, readdir } from "node:fs/promises";
import { vi } from "vitest";
import pg from "pg";
import { getPool, withUser } from "@/lib/server/db.server";
import { pgSessionRepository } from "./session.server";
import { pgDiscountApprovalRepository } from "./discount-approval.server";
import { recordSession, type RecordSessionInput } from "../use-cases/record-session";
import { editSession } from "../use-cases/edit-session";
import { requestDiscountApproval } from "../use-cases/discount-approval";

export const company = "20000000-0000-4000-8000-000000000001";
export const branch1 = "20000000-0000-4000-8000-000000000002";
export const branch2 = "20000000-0000-4000-8000-000000000003";
export const staff1 = "20000000-0000-4000-8000-000000000004";
export const staff1b = "20000000-0000-4000-8000-000000000005";
export const staff2 = "20000000-0000-4000-8000-000000000006";
export const service1 = "20000000-0000-4000-8000-000000000007";
export const service2 = "20000000-0000-4000-8000-000000000008";
export const owner = "sc020-owner";
export const manager1 = "sc020-manager-1";
export const manager2 = "sc020-manager-2";
export const reception = "sc020-reception";
export const sessionNow = new Date("2027-03-10T15:00:00Z");

export const baseRecord: RecordSessionInput = {
  requestId: "20000000-0000-4000-8000-000000000010",
  serviceId: service1,
  staffId: staff1,
  clientName: "Huda",
  clientPhone: "96550001111",
  occurredAt: "2027-03-10T14:30",
};

export const record = (
  user: string,
  overrides: Partial<RecordSessionInput> = {},
  now: Date = sessionNow,
) =>
  withUser(user, (db) =>
    recordSession(
      pgSessionRepository(db, user, company),
      pgDiscountApprovalRepository(db, company),
      { ...baseRecord, ...overrides },
      now,
    ),
  );

export const requestRemote = (user: string, sessionId: string, price: string) =>
  withUser(user, (db) =>
    requestDiscountApproval(
      pgSessionRepository(db, user, company),
      pgDiscountApprovalRepository(db, company),
      { sessionId, serviceId: service1, staffId: staff1, price, discountReason: "offer" },
    ),
  );

export const edit = (user: string, overrides: Record<string, unknown> = {}) =>
  withUser(user, (db) =>
    editSession(
      pgSessionRepository(db, user, company),
      pgDiscountApprovalRepository(db, company),
      {
        sessionId: "20000000-0000-4000-8000-000000000011",
        serviceId: service2,
        staffId: staff1b,
        clientName: "Huda",
        clientPhone: "96550001111",
        occurredAt: "2027-03-10T14:30",
        price: "15.000",
        discountReason: "شعر طويل",
        editReason: "اختيار خاطئ",
        ...overrides,
      },
      new Date("2027-03-13T12:00:00Z"),
    ),
  );

/** يطبق كل الهجرات مرتين ويبني شركة الأجهزة مع مستخدميها وخدماتها. */
export async function setupSessionControls(): Promise<pg.Pool> {
  const url = process.env["POSPAY_TEST_DATABASE_URL"];
  if (
    !url ||
    !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/pospay_test"
  )
    throw new Error("Disposable localhost pospay_test required");
  vi.stubEnv("DATABASE_URL", url);
  const admin = new pg.Pool({ connectionString: url });
  for (let pass = 0; pass < 2; pass++)
    for (const file of (await readdir("db/migrations"))
      .filter((f) => /^\d{4}_.*\.sql$/.test(f))
      .sort())
      await admin.query(await readFile(`db/migrations/${file}`, "utf8"));
  await admin.query("insert into public.companies(id,name) values($1,'Controls salon')", [company]);
  await admin.query(
    `insert into public."user"(id,email,name) values
     ($1,$2,'Owner'),($3,$4,'Branch 1 manager'),($5,$6,'Branch 2 manager'),
     ($7,$8,'Reception'),($9,$10,'Staff user')`,
    [
      owner,
      `${owner}@test.local`,
      manager1,
      `${manager1}@test.local`,
      manager2,
      `${manager2}@test.local`,
      reception,
      `${reception}@test.local`,
      "sc020-staff",
      "sc020-staff@test.local",
    ],
  );
  await admin.query(
    `insert into public.branches(id,company_id,name,timezone)
     values($1,$2,'Branch 1','UTC'),($3,$2,'Branch 2','UTC')`,
    [branch1, company, branch2],
  );
  await admin.query(
    `insert into public.memberships(company_id,user_id,role,branch_id) values
     ($1,$2,'owner',null),($1,$3,'branch_manager',$4),($1,$5,'branch_manager',$6),
     ($1,$7,'reception',$4),($1,$8,'staff',$4)`,
    [company, owner, manager1, branch1, manager2, branch2, reception, "sc020-staff"],
  );
  await admin.query(
    `insert into public.staff_members(company_id,id,branch_id,user_id,display_name) values
     ($1,$2,$3,$4,'Staff 1'),($1,$5,$3,$6,'Staff 1b'),($1,$7,$8,$9,'Staff 2')`,
    [
      company,
      staff1,
      branch1,
      "sc020-staff-1",
      staff1b,
      "sc020-staff-1b",
      staff2,
      branch2,
      "sc020-staff-2",
    ],
  );
  await admin.query(
    `insert into public.service_catalog(company_id,id,name,price_mills)
     values($1,$2,'Hair',100000),($1,$3,'Haircut',12500)`,
    [company, service1, service2],
  );
  await admin.query(
    `insert into public.service_assignments(company_id,service_id,staff_id)
     values($1,$2,$3),($1,$2,$4),($1,$2,$5),($1,$6,$3),($1,$6,$4)`,
    [company, service1, staff1, staff1b, staff2, service2],
  );
  await admin.query(
    "insert into public.discount_grants(company_id,role,max_percent,granted_by) values($1,'reception',10,$2)",
    [company, owner],
  );
  return admin;
}

/** يحذف كل بيانات شركة الأجهزة ويغلق المجموعتين. */
export async function cleanupSessionControls(admin: pg.Pool): Promise<void> {
  // القيود الدائرية بين جدولي الاعتمادات والطلبات تمنع الحذف المتسلسل،
  // فنلغي فاعلية القيود مؤقتاً داخل المعاملة عند التنظيف فقط.
  await admin.query(
    `begin;
     set local session_replication_role = replica;
     delete from public.service_session_edits where company_id='${company}';
     delete from public.manager_pin_attempts where company_id='${company}';
     delete from public.discount_approvals where company_id='${company}';
     delete from public.discount_approval_requests where company_id='${company}';
     delete from public.closed_commission_months where company_id='${company}';
     delete from public.service_sessions where company_id='${company}';
     delete from public.clients where company_id='${company}';
     delete from public.discount_grants where company_id='${company}';
     delete from public.service_assignments where company_id='${company}';
     delete from public.service_catalog where company_id='${company}';
     delete from public.audit_log where company_id='${company}';
     delete from public.manager_pins where company_id='${company}';
     delete from public.staff_members where company_id='${company}';
     delete from public.memberships where company_id='${company}';
     delete from public.permission_overrides where company_id='${company}';
     delete from public.branches where company_id='${company}';
     delete from public.companies where id='${company}';
     delete from public."user" where id like 'sc020-%';
     commit;`,
  );
  await admin.end();
  await getPool().end();
}
