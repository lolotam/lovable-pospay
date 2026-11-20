// @vitest-environment node
import { expect, it, vi } from "vitest";
import { editSessionFn } from "./session.functions";

const repositoryArgs = vi.hoisted(() => [] as unknown[][]);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: (handler: unknown) => handler }),
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers({ "user-agent": "Salon tablet" }),
}));
vi.mock("@/lib/server/session.server", () => ({ requireUserId: async () => "user-1" }));
vi.mock("@/lib/server/db.server", () => ({
  withUser: (_user: string, run: (db: unknown) => unknown) => run({}),
}));
vi.mock("../persistence/session.server", () => ({
  pgSessionRepository: (...args: unknown[]) => {
    repositoryArgs.push(args);
    return {};
  },
}));
vi.mock("../persistence/discount-approval.server", () => ({
  pgDiscountApprovalRepository: () => ({}),
}));
vi.mock("../use-cases/edit-session", () => ({
  editSession: async () => ({ status: "saved", sessionId: "s1" }),
}));

// محاولات PIN الفاشلة من نافذة التعديل تسجل جهاز المستخدم مثل التسجيل (020 B3).
it("passes the device user agent to the session repository when editing", async () => {
  await editSessionFn({
    data: {
      companyId: "40000000-0000-4000-8000-000000000001",
      sessionId: "40000000-0000-4000-8000-000000000005",
      serviceId: "40000000-0000-4000-8000-000000000002",
      staffId: "40000000-0000-4000-8000-000000000003",
      clientName: "Fixture",
      clientPhone: "96555551234",
      occurredAt: "2026-11-18T10:00",
      price: "10.000",
      editReason: "تصحيح",
    },
  } as never);
  expect(repositoryArgs.at(-1)?.[3]).toBe("Salon tablet");
});
