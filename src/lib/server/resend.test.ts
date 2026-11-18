// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResendPasswordSender, getResendPasswordSender } from "./resend.server";

const config = {
  apiKey: "test-gateway-key",
  connectionKey: "test-connection-key",
  from: "PosPay <noreply@pospay.systems>",
  origin: "https://app.pospay.systems",
};
const data = {
  user: {
    id: "test-user",
    email: "test@example.com",
    name: "Test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  url: "https://app.pospay.systems/api/auth/reset-password/test-token",
  token: "test-token",
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Resend password reset delivery", () => {
  it("sends only to the account email through the connected gateway", async () => {
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await createResendPasswordSender(config)(data);
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected delivery request");
    const [url, init] = call;
    expect(url).toBe("https://connector-gateway.lovable.dev/resend/emails");
    expect(JSON.parse(init.body).to).toEqual(["test@example.com"]);
    expect(JSON.parse(init.body).from).toBe("PosPay <noreply@pospay.systems>");
    expect(init.headers["X-Connection-Api-Key"]).toBe("test-connection-key");
  });
  it("rejects reset links outside the app without sending", async () => {
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await expect(
      createResendPasswordSender(config)({
        ...data,
        url: "https://attacker.invalid/api/auth/reset-password/token",
      }),
    ).rejects.toThrow("INVALID_RESET_LINK");
    expect(request).not.toHaveBeenCalled();
  });
  it("does not report successful delivery after a provider failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider body", { status: 403 })),
    );
    await expect(createResendPasswordSender(config)(data)).rejects.toThrow(
      "PASSWORD_RESET_DELIVERY_FAILED_403",
    );
  });
  it("leaves sending disabled when required credentials are missing", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(getResendPasswordSender()).toBeUndefined();
  });
});
