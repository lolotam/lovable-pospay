// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type pg from "pg";
import { withUser } from "@/lib/server/db.server";
import { pgSessionRepository } from "./session.server";
import { pgManagerPinRepository } from "./manager-pin.server";
import { pgDiscountApprovalRepository } from "./discount-approval.server";
import {
  cleanupSessionControls,
  company,
  manager1,
  manager2,
  reception,
  record,
  requestRemote,
  service1,
  service2,
  setupSessionControls,
  branch1,
  staff1b,
} from "./session-controls.fixture";
import {
  decideDiscountApproval,
  getDiscountApprovalStatus,
  listPendingDiscountApprovals,
} from "../use-cases/discount-approval";

describe.skipIf(!process.env["POSPAY_TEST_DATABASE_URL"])(
  "020 record approvals under real RLS",
  () => {
    let admin: pg.Pool;

    beforeAll(async () => {
      admin = await setupSessionControls();
    });

    afterAll(async () => {
      if (admin) {
        await cleanupSessionControls(admin);
        vi.unstubAllEnvs();
      }
    });

    it("allows a surcharge above list with a reason and refuses it without one (Q3 #1)", async () => {
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000011",
          serviceId: service2,
          price: "15.000",
          discountReason: "شعر طويل",
        }),
      ).resolves.toEqual({
        status: "saved",
        id: "20000000-0000-4000-8000-000000000011",
        replayed: false,
      });
      const row = await admin.query(
        `select price_mills::text as price,list_price_mills::text as list,approved_by
       from public.service_sessions where company_id=$1 and id=$2`,
        ["20000000-0000-4000-8000-000000000001", "20000000-0000-4000-8000-000000000011"],
      );
      expect(row.rows[0]).toEqual({ price: "15000", list: "12500", approved_by: null });
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000012",
          serviceId: service2,
          price: "15.000",
        }),
      ).rejects.toThrow("DISCOUNT_REASON_REQUIRED");
    });

    it("saves a within-cap discount and returns pin_required without approval (Q1 #2)", async () => {
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000013",
          occurredAt: "2027-03-10T14:31",
          price: "90.000",
          discountReason: "offer",
        }),
      ).resolves.toEqual({
        status: "saved",
        id: "20000000-0000-4000-8000-000000000013",
        replayed: false,
      });
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000014",
          occurredAt: "2027-03-10T14:32",
          price: "85.000",
          discountReason: "offer",
        }),
      ).resolves.toEqual({ status: "pin_required", approvers: [] });
      expect(
        (
          await admin.query(
            "select count(*)::int as n from public.service_sessions where company_id=$1",
            ["20000000-0000-4000-8000-000000000001"],
          )
        ).rows[0].n,
      ).toBe(2);
    });

    it("completes a remote approval when no approver has a PIN (#7)", async () => {
      const requestId = "20000000-0000-4000-8000-000000000015";
      const occurredAt = new Date(Date.now() - 3_600_000).toISOString().slice(0, 16);
      const created = await requestRemote(reception, requestId, "85.000");
      const otherBranch = await withUser(manager2, (db) =>
        listPendingDiscountApprovals(pgDiscountApprovalRepository(db, company), company),
      );
      expect(otherBranch).toEqual([]);
      const pending = await withUser(manager1, (db) =>
        listPendingDiscountApprovals(pgDiscountApprovalRepository(db, company), company),
      );
      expect(pending).toHaveLength(1);
      expect(pending[0]).toMatchObject({
        serviceName: "Hair",
        listPriceMills: 100000n,
        requestedPriceMills: 85000n,
        discountReason: "offer",
      });
      await withUser(manager1, (db) =>
        decideDiscountApproval(pgDiscountApprovalRepository(db, company), created.id, true),
      );
      await expect(
        withUser(reception, (db) =>
          getDiscountApprovalStatus(
            pgDiscountApprovalRepository(db, company),
            created.id,
            new Date(),
          ),
        ),
      ).resolves.toMatchObject({ status: "approved", approverUserId: manager1 });
      await expect(
        record(
          reception,
          {
            requestId,
            occurredAt,
            price: "85.000",
            discountReason: "offer",
            managerApproval: { kind: "remote", approvalRequestId: created.id },
          },
          new Date(),
        ),
      ).resolves.toEqual({ status: "saved", id: requestId, replayed: false });
      const saved = await admin.query(
        "select approved_by from public.service_sessions where company_id=$1 and id=$2",
        [company, requestId],
      );
      expect(saved.rows[0].approved_by).toBe(manager1);
      const approval = await admin.query(
        "select consumed_at from public.discount_approvals where company_id=$1 and request_id=$2",
        [company, created.id],
      );
      expect(approval.rows[0].consumed_at).not.toBeNull();
    });

    it("returns approval_unavailable rejected for a rejected request (#7)", async () => {
      const requestId = "20000000-0000-4000-8000-000000000016";
      const created = await requestRemote(reception, requestId, "85.000");
      await withUser(manager1, (db) =>
        decideDiscountApproval(pgDiscountApprovalRepository(db, company), created.id, false),
      );
      await expect(
        record(reception, {
          requestId,
          occurredAt: "2027-03-10T14:34",
          price: "85.000",
          discountReason: "offer",
          managerApproval: { kind: "remote", approvalRequestId: created.id },
        }),
      ).resolves.toEqual({ status: "approval_unavailable", state: "rejected" });
      expect(
        (
          await admin.query(
            "select count(*)::int as n from public.service_sessions where company_id=$1 and id=$2",
            [company, requestId],
          )
        ).rows[0].n,
      ).toBe(0);
    });

    it("expires untouched requests and refuses deciding them (#7)", async () => {
      const requestId = "20000000-0000-4000-8000-000000000017";
      const created = await requestRemote(reception, requestId, "85.000");
      await admin.query(
        "update public.discount_approval_requests set expires_at=now()-interval '1 minute' where company_id=$1 and id=$2",
        [company, created.id],
      );
      const status = await withUser(reception, async (db) =>
        getDiscountApprovalStatus(
          pgDiscountApprovalRepository(db, company),
          created.id,
          new Date(),
        ),
      );
      expect(status).toMatchObject({ status: "expired" });
      await expect(
        withUser(manager1, (db) =>
          decideDiscountApproval(pgDiscountApprovalRepository(db, company), created.id, true),
        ),
      ).rejects.toThrow("APPROVAL_REQUEST_CLOSED");
      await expect(
        record(reception, {
          requestId,
          occurredAt: "2027-03-10T14:35",
          price: "85.000",
          discountReason: "offer",
          managerApproval: { kind: "remote", approvalRequestId: created.id },
        }),
      ).resolves.toEqual({ status: "approval_unavailable", state: "expired" });
    });

    it("refuses a remote approval whose binding differs from the save (#7)", async () => {
      const requestId = "20000000-0000-4000-8000-000000000018";
      const occurredAt = new Date(Date.now() - 5_400_000).toISOString().slice(0, 16);
      const created = await requestRemote(reception, requestId, "85.000");
      await withUser(manager1, (db) =>
        decideDiscountApproval(pgDiscountApprovalRepository(db, company), created.id, true),
      );
      await expect(
        record(
          reception,
          {
            requestId,
            occurredAt,
            price: "80.000",
            discountReason: "offer",
            managerApproval: { kind: "remote", approvalRequestId: created.id },
          },
          new Date(),
        ),
      ).resolves.toEqual({ status: "approval_unavailable", state: "mismatch" });
    });

    it("records every wrong PIN without lockout and saves on the 7th try (#3)", async () => {
      await withUser(manager1, async (db) => pgManagerPinRepository(db, company).setPin("1234"));
      await withUser(manager2, (db) => pgManagerPinRepository(db, company).setPin("4321"));
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000019",
          occurredAt: "2027-03-10T14:37",
          price: "85.000",
          discountReason: "offer",
        }),
      ).resolves.toEqual({
        status: "pin_required",
        approvers: [{ userId: manager1, name: "Branch 1 manager" }],
      });
      const attemptsBefore = await attemptCount();
      for (let index = 0; index < 6; index++) {
        await expect(
          withUser(reception, (db) =>
            pgSessionRepository(db, reception, company, "vitest-agent").verifyManagerPin({
              branchId: branch1,
              sessionId: "20000000-0000-4000-8000-000000000020",
              serviceId: service1,
              listPriceMills: 100000n,
              priceMills: 85000n,
              approverUserId: manager1,
              pin: `000${index}`,
            }),
          ),
        ).resolves.toEqual({ status: "invalid" });
      }
      expect(await attemptCount()).toBe(attemptsBefore + 6);
      await expect(
        record(reception, {
          requestId: "20000000-0000-4000-8000-000000000020",
          occurredAt: "2027-03-10T14:38",
          price: "85.000",
          discountReason: "offer",
          managerApproval: { kind: "pin", approverUserId: manager1, pin: "1234" },
        }),
      ).resolves.toEqual({
        status: "saved",
        id: "20000000-0000-4000-8000-000000000020",
        replayed: false,
      });
      expect(await attemptCount()).toBe(attemptsBefore + 6);
      const saved = await admin.query(
        `select s.approved_by,s.approved_at,a.created_at as approval_created
       from public.service_sessions s
       join public.discount_approvals a on a.company_id=s.company_id and a.id=s.approval_id
       where s.company_id=$1 and s.id=$2`,
        [company, "20000000-0000-4000-8000-000000000020"],
      );
      expect(saved.rows[0].approved_by).toBe(manager1);
      expect(saved.rows[0].approved_at).toEqual(saved.rows[0].approval_created);
      expect(
        (
          await admin.query(
            "select count(*)::int as n from public.audit_log where company_id=$1 and action='manager_pin.failed'",
            [company],
          )
        ).rows[0].n,
      ).toBe(6);
    });

    it("refuses a branch 2 manager approving a branch 1 discount (B1)", async () => {
      await expect(
        withUser(reception, (db) =>
          pgSessionRepository(db, reception, company).verifyManagerPin({
            branchId: branch1,
            sessionId: "20000000-0000-4000-8000-000000000021",
            serviceId: service1,
            listPriceMills: 100000n,
            priceMills: 85000n,
            approverUserId: manager2,
            pin: "4321",
          }),
        ),
      ).rejects.toThrow("APPROVER_NOT_ALLOWED");
    });

    it("warns on a duplicate minute and saves only after confirmation (Q4 #4)", async () => {
      const first = "20000000-0000-4000-8000-000000000022";
      const second = "20000000-0000-4000-8000-000000000023";
      await expect(
        record(reception, {
          requestId: first,
          serviceId: service2,
          staffId: "20000000-0000-4000-8000-000000000005",
          clientName: "Salma",
          clientPhone: "96550002222",
          occurredAt: "2027-03-10T14:40",
        }),
      ).resolves.toEqual({ status: "saved", id: first, replayed: false });
      await expect(
        record(reception, {
          requestId: second,
          serviceId: service2,
          staffId: "20000000-0000-4000-8000-000000000005",
          clientName: "Salma",
          clientPhone: "96550002222",
          occurredAt: "2027-03-10T14:40",
        }),
      ).resolves.toEqual({ status: "duplicate_warning" });
      await expect(
        record(reception, {
          requestId: second,
          serviceId: service2,
          staffId: "20000000-0000-4000-8000-000000000005",
          clientName: "Salma",
          clientPhone: "96550002222",
          occurredAt: "2027-03-10T14:40",
          confirmDuplicate: true,
        }),
      ).resolves.toEqual({ status: "saved", id: second, replayed: false });
      const audits = await admin.query(
        `select details->>'duplicateConfirmed' as confirmed from public.audit_log
       where company_id=$1 and entity_id=$2 and action='session.recorded'`,
        [company, second],
      );
      expect(audits.rows[0].confirmed).toBe("true");
      await expect(
        record(reception, {
          requestId: second,
          serviceId: service2,
          staffId: "20000000-0000-4000-8000-000000000005",
          clientName: "Salma",
          clientPhone: "96550002222",
          occurredAt: "2027-03-10T14:40",
        }),
      ).resolves.toEqual({ status: "saved", id: second, replayed: true });
    });

    it("refuses pospay_app direct writes to protected tables (B5)", async () => {
      await expect(
        withUser("sc020-owner", (db) =>
          db.query("update public.service_sessions set price_mills=1 where company_id=$1", [
            company,
          ]),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withUser("sc020-owner", (db) =>
          db.query(
            "update public.discount_approval_requests set status='approved' where company_id=$1",
            [company],
          ),
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        withUser("sc020-owner", (db) =>
          db.query("select pin_hash from public.manager_pins where company_id=$1", [company]),
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });

    async function attemptCount() {
      const result = await admin.query(
        "select count(*)::int as n from public.manager_pin_attempts where company_id=$1",
        [company],
      );
      return result.rows[0].n as number;
    }
  },
);
