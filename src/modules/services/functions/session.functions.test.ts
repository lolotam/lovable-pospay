// @vitest-environment node
import { expect, it, vi } from "vitest";
import { getSessionFormFn, recordSessionFn } from "./session.functions";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: () => ({ handler: (handler: unknown) => handler }),
  }),
}));

const companyId = "40000000-0000-0000-0000-000000000001";

it("keeps the session form and mutation unavailable pending the price policy", async () => {
  await expect(getSessionFormFn({ data: { companyId } })).resolves.toEqual({
    canRecord: false,
    discountCap: 0,
    services: [],
    staff: [],
  });
  await expect(
    recordSessionFn({
      data: {
        companyId,
        requestId: "40000000-0000-0000-0000-000000000005",
        serviceId: "40000000-0000-0000-0000-000000000002",
        staffId: "40000000-0000-0000-0000-000000000003",
        clientName: "Fixture",
        clientPhone: "96555551234",
        occurredAt: "2026-11-18T10:00",
      },
    }),
  ).rejects.toThrow("SESSION_RECORDING_UNAVAILABLE");
});
