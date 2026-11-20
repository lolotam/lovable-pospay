// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { withUser } from "@/lib/server/db.server";
import { pgSessionRepository } from "./session.server";
import { pgDiscountApprovalRepository } from "./discount-approval.server";
import {
  branch1,
  cleanupSessionControls,
  company,
  edit,
  manager1,
  manager2,
  owner,
  reception,
  record,
  service1,
  setupSessionControls,
} from "./session-controls.fixture";
import { closeMonth } from "../use-cases/close-month";
import { editSession } from "../use-cases/edit-session";
import { decideDiscountApproval, requestDiscountApproval } from "../use-cases/discount-approval";

const closedMonthEdit = (user: string) =>
  withUser(user, (db) =>
    editSession(
      pgSessionRepository(db, user, company),
      pgDiscountApprovalRepository(db, company),
      {
        sessionId: "20000000-0000-4000-8000-000000000024",
        hintOccurredAt: "2026-10-15T10:00",
        serviceId: service1,
        staffId: "20000000-0000-4000-8000-000000000005",
        clientName: "Huda",
        clientPhone: "96550001111",
        occurredAt: "2026-10-15T11:00",
        price: "100.000",
        editReason: "تصحيح",
      },
      new Date("2026-11-01T12:00:00Z"),
    ),
  );

describe.skipIf(!process.env["POSPAY_TEST_DATABASE_URL"])(
  "020 session editing and month lock",
  () => {
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = await setupSessionControls();
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000011",
          serviceId: "20000000-0000-4000-8000-000000000008",
          price: "15.000",
          discountReason: "شعر طويل",
        }),
      ).resolves.toHaveProperty("status", "saved");
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000024",
          occurredAt: "2026-10-15T10:00",
        }),
      ).resolves.toHaveProperty("status", "saved");
    });

    afterAll(async () => {
      if (admin) {
        await cleanupSessionControls(admin);
        vi.unstubAllEnvs();
      }
    });

    it("refuses editing for roles outside the sessions.edit map (#5)", async () => {
      await expect(edit("sc020-staff")).rejects.toThrow("FORBIDDEN");
      await expect(edit(reception)).rejects.toThrow("FORBIDDEN");
      await expect(
        withUser(manager2, (db) =>
          pgSessionRepository(db, manager2, company).canEditSession(branch1),
        ),
      ).resolves.toBe(false);
    });

    it("lets the default-allowed manager and a granted reception edit with audit (#5)", async () => {
      await expect(edit(manager1)).resolves.toEqual({
        status: "saved",
        sessionId: "20000000-0000-4000-8000-000000000011",
      });
      await admin.query(
        `insert into public.permission_overrides(company_id,user_id,permission,effect)
       values($1,$2,'sessions.edit','allow')`,
        [company, reception],
      );
      await expect(edit(reception)).resolves.toEqual({
        status: "saved",
        sessionId: "20000000-0000-4000-8000-000000000011",
      });
      const history = await admin.query(
        `select edited_by,before_snapshot->>'staffId' as before_staff,
              after_snapshot->>'staffId' as after_staff,edit_reason
       from public.service_session_edits where company_id=$1 and edited_by=$2`,
        [company, reception],
      );
      expect(history.rows).toHaveLength(1);
      expect(history.rows[0]).toMatchObject({
        before_staff: "20000000-0000-4000-8000-000000000005",
        after_staff: "20000000-0000-4000-8000-000000000005",
        edit_reason: "اختيار خاطئ",
      });
      await expect(
        edit(reception, { clientName: "Huda Ali", clientPhone: undefined }),
      ).rejects.toThrow("CLIENT_PHONE_REQUIRED");
      await expect(edit(reception, { clientName: "Huda Ali" })).resolves.toEqual({
        status: "saved",
        sessionId: "20000000-0000-4000-8000-000000000011",
      });
      const client = await admin.query(
        "select name from public.clients where company_id=$1 and phone='96550001111'",
        [company],
      );
      expect(client.rows[0].name).toBe("Huda Ali");
      await expect(edit(owner)).resolves.toHaveProperty("status", "saved");
      expect(
        (
          await admin.query(
            "select count(*)::int as n from public.service_session_edits where company_id=$1",
            [company],
          )
        ).rows[0].n,
      ).toBe(4);
      expect(
        (
          await admin.query(
            "select count(*)::int as n from public.audit_log where company_id=$1 and action='session.edited'",
            [company],
          )
        ).rows[0].n,
      ).toBe(4);
    });

    it("matches a remote edit approval against the edited-to service (020 B4.5)", async () => {
      const sessionId = "20000000-0000-4000-8000-000000000027";
      const occurredAt = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
      await expect(
        record(reception, {
          requestId: sessionId,
          serviceId: "20000000-0000-4000-8000-000000000008",
          staffId: "20000000-0000-4000-8000-000000000004",
          occurredAt,
          price: "12.500",
        }),
      ).resolves.toHaveProperty("status", "saved");
      const created = await withUser(reception, (db) =>
        requestDiscountApproval(
          pgSessionRepository(db, reception, company),
          pgDiscountApprovalRepository(db, company),
          {
            sessionId,
            serviceId: service1,
            staffId: "20000000-0000-4000-8000-000000000005",
            price: "85.000",
            listPrice: "100.000",
            discountReason: "تحويل خدمة",
          },
        ),
      );
      await withUser(manager1, (db) =>
        decideDiscountApproval(pgDiscountApprovalRepository(db, company), created.id, true),
      );
      await expect(
        withUser(reception, (db) =>
          editSession(
            pgSessionRepository(db, reception, company),
            pgDiscountApprovalRepository(db, company),
            {
              sessionId,
              hintOccurredAt: occurredAt,
              serviceId: service1,
              staffId: "20000000-0000-4000-8000-000000000005",
              clientName: "Huda",
              clientPhone: "96550001111",
              occurredAt,
              price: "85.000",
              discountReason: "تحويل خدمة",
              editReason: "تحويل خدمة",
              managerApproval: { kind: "remote", approvalRequestId: created.id },
            },
            new Date(),
          ),
        ),
      ).resolves.toEqual({ status: "saved", sessionId });
      const row = await admin.query(
        "select service_id::text as service,price_mills::text as price from public.service_sessions where company_id=$1 and id=$2",
        [company, sessionId],
      );
      expect(row.rows[0]).toEqual({ service: service1, price: "85000" });
    });

    it("binds a remote edit approval to the stored list price after a catalog change (020 D3)", async () => {
      const sessionId = "20000000-0000-4000-8000-000000000028";
      const occurredAt = new Date(Date.now() - 7_200_000).toISOString().slice(0, 16);
      const service2 = "20000000-0000-4000-8000-000000000008";
      await expect(
        record(reception, {
          requestId: sessionId,
          serviceId: service2,
          staffId: "20000000-0000-4000-8000-000000000004",
          occurredAt,
          price: "11.250",
          discountReason: "offer",
        }),
      ).resolves.toHaveProperty("status", "saved");
      await admin.query(
        "update public.service_catalog set price_mills=20000 where company_id=$1 and id=$2",
        [company, service2],
      );
      const created = await withUser(reception, (db) =>
        requestDiscountApproval(
          pgSessionRepository(db, reception, company),
          pgDiscountApprovalRepository(db, company),
          {
            sessionId,
            serviceId: service2,
            staffId: "20000000-0000-4000-8000-000000000004",
            price: "10.000",
            listPrice: "12.500",
            discountReason: "تصحيح",
          },
        ),
      );
      await withUser(manager1, (db) =>
        decideDiscountApproval(pgDiscountApprovalRepository(db, company), created.id, true),
      );
      await expect(
        withUser(reception, (db) =>
          editSession(
            pgSessionRepository(db, reception, company),
            pgDiscountApprovalRepository(db, company),
            {
              sessionId,
              hintOccurredAt: occurredAt,
              serviceId: service2,
              staffId: "20000000-0000-4000-8000-000000000004",
              clientName: "Huda",
              clientPhone: "96550001111",
              occurredAt,
              price: "10.000",
              discountReason: "تصحيح",
              editReason: "تصحيح سعر",
              managerApproval: { kind: "remote", approvalRequestId: created.id },
            },
            new Date(),
          ),
        ),
      ).resolves.toEqual({ status: "saved", sessionId });
      await admin.query(
        "update public.service_catalog set price_mills=12500 where company_id=$1 and id=$2",
        [company, service2],
      );
    });

    it("blocks editing and recording in a closed month for everyone (Q5 D2)", async () => {
      await expect(
        withUser(manager1, (db) =>
          closeMonth(pgSessionRepository(db, manager1, company), { periodMonth: "2026-10-01" }),
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        withUser(manager1, (db) =>
          db.query(
            "insert into public.closed_commission_months(company_id,period_month,closed_by) values($1,'2026-10-01',$2)",
            [company, manager1],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withUser(owner, (db) =>
          closeMonth(pgSessionRepository(db, owner, company), {
            periodMonth: "2026-10-01",
            note: "monthly report",
          }),
        ),
      ).resolves.toBeUndefined();
      for (const user of [reception, manager1, owner]) {
        await expect(closedMonthEdit(user)).rejects.toThrow("PERIOD_CLOSED");
      }
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000025",
          occurredAt: "2026-10-16T10:00",
        }),
      ).rejects.toThrow("PERIOD_CLOSED");
    });

    it("requires the strong confirmation for a not-ended month (Q5 D2)", async () => {
      await expect(
        withUser(owner, (db) =>
          closeMonth(pgSessionRepository(db, owner, company), { periodMonth: "2027-03-01" }),
        ),
      ).rejects.toThrow("MONTH_NOT_ENDED_CONFIRMATION_REQUIRED");
      await expect(
        withUser(owner, (db) =>
          closeMonth(pgSessionRepository(db, owner, company), {
            periodMonth: "2027-03-01",
            confirmUnfinishedMonth: true,
          }),
        ),
      ).resolves.toBeUndefined();
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000026",
          occurredAt: "2027-03-09T10:00",
        }),
      ).rejects.toThrow("PERIOD_CLOSED");
      const months = await withUser(owner, (db) =>
        pgSessionRepository(db, owner, company).listClosedMonths(),
      );
      expect(months.map((month) => month.periodMonth)).toEqual(["2027-03-01", "2026-10-01"]);
      expect(months[0]).toMatchObject({ closedBy: owner });
      expect(months[1]).toMatchObject({ closedBy: owner, note: "monthly report" });
      const status = await withUser(owner, (db) =>
        pgSessionRepository(db, owner, company).monthCloseStatus("2027-03-01"),
      );
      expect(status).toBeGreaterThan(0);
    });
  },
);
