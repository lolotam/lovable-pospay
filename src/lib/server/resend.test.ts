// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResendPasswordSender,
  getResendPasswordSender,
  getResendOtpSender,
  isEmailRecoveryConfigured,
  resolveResendTransport,
  sendInvitationEmail,
} from "./resend.server";

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
  it("sends the six-digit OTP through Resend to the requested registered email", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway-key");
    vi.stubEnv("RESEND_API_KEY", "test-connection-key");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.pospay.systems");
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await getResendOtpSender()({
      email: "test@example.com",
      otp: "123456",
      type: "forget-password",
    });
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected OTP delivery");
    expect(call[0]).toBe("https://connector-gateway.lovable.dev/resend/emails");
    expect(call[1].signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(call[1].body);
    expect(body.to).toEqual(["test@example.com"]);
    expect(body.text).toContain("123456");
  });
  it("does not claim OTP delivery if the email provider rejects it", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway-key");
    vi.stubEnv("RESEND_API_KEY", "test-connection-key");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.pospay.systems");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("denied", { status: 403 })));
    await expect(
      getResendOtpSender()({ email: "test@example.com", otp: "123456", type: "forget-password" }),
    ).rejects.toThrow("EMAIL_OTP_DELIVERY_FAILED_403");
  });
  it("sends only to the account email through the connected gateway", async () => {
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await createResendPasswordSender(config)(data);
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected delivery request");
    const [url, init] = call;
    expect(init.signal).toBeInstanceOf(AbortSignal);
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

const gatewayTransport = {
  url: "https://connector-gateway.lovable.dev/resend/emails",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer test-gateway-key",
    "X-Connection-Api-Key": "test-connection-key",
  },
};
const directTransport = {
  url: "https://api.resend.com/emails",
  headers: {
    Authorization: "Bearer re_test_key",
    "Content-Type": "application/json",
    "User-Agent": "PosPay/1.0",
  },
};

describe("Resend transport selection", () => {
  it.each([
    ["both keys use the gateway", "test-gateway-key", "test-connection-key", gatewayTransport],
    ["only the provider key sends directly", "", "re_test_key", directTransport],
    ["only the gateway key disables delivery", "test-gateway-key", "", undefined],
    ["no keys disable delivery", "", "", undefined],
  ])("%s", (_scenario, lovableKey, resendKey, expected) => {
    vi.stubEnv("LOVABLE_API_KEY", lovableKey);
    vi.stubEnv("RESEND_API_KEY", resendKey);
    expect(resolveResendTransport()).toEqual(expected);
  });

  it.each([
    [
      "direct transport with an app URL enables recovery",
      "",
      "re_test_key",
      "https://app.pospay.systems",
      true,
    ],
    [
      "gateway transport with an app URL enables recovery",
      "test-gateway-key",
      "test-connection-key",
      "https://app.pospay.systems",
      true,
    ],
    ["a missing app URL disables recovery", "", "re_test_key", "", false],
    ["a missing transport disables recovery", "", "", "https://app.pospay.systems", false],
  ])("%s", (_scenario, lovableKey, resendKey, baseURL, expected) => {
    vi.stubEnv("LOVABLE_API_KEY", lovableKey);
    vi.stubEnv("RESEND_API_KEY", resendKey);
    vi.stubEnv("BETTER_AUTH_URL", baseURL);
    expect(isEmailRecoveryConfigured()).toBe(expected);
  });
});

describe("Direct Resend password reset delivery", () => {
  it("sends password reset email directly with reset idempotency", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.pospay.systems");
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    const sender = getResendPasswordSender();
    if (!sender) throw new Error("Expected direct password sender");
    await sender(data);
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected direct reset delivery");
    const [url, init] = call;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "User-Agent": "PosPay/1.0",
      "Idempotency-Key": "password-reset-test-token",
    });
    expect(init.headers["X-Connection-Api-Key"]).toBeUndefined();
    expect(JSON.parse(init.body).to).toEqual(["test@example.com"]);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("Direct Resend OTP delivery", () => {
  it("sends OTP email directly without an idempotency key", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.pospay.systems");
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await getResendOtpSender()({
      email: "test@example.com",
      otp: "123456",
      type: "forget-password",
    });
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected direct OTP delivery");
    const [url, init] = call;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "User-Agent": "PosPay/1.0",
    });
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
    expect(init.headers["X-Connection-Api-Key"]).toBeUndefined();
    expect(JSON.parse(init.body).text).toContain("123456");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("Invitation delivery transport", () => {
  it("keeps invitations on the gateway when both keys are set", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-gateway-key");
    vi.stubEnv("RESEND_API_KEY", "test-connection-key");
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await expect(
      sendInvitationEmail("test@example.com", "https://app.pospay.systems/invite?t=x", "Test"),
    ).resolves.toBe(true);
    const [url, init] = request.mock.calls[0] ?? [];
    expect(url).toBe(gatewayTransport.url);
    expect(init.headers).toEqual(gatewayTransport.headers);
  });

  it("sends invitation email directly and reports success", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("RESEND_FROM", "");
    const request = vi.fn().mockResolvedValue(new Response('{"id":"sent"}', { status: 200 }));
    vi.stubGlobal("fetch", request);
    await expect(
      sendInvitationEmail(
        "test@example.com",
        "https://app.pospay.systems/invite?t=test-token",
        "Test Company",
      ),
    ).resolves.toBe(true);
    const call = request.mock.calls[0];
    if (!call) throw new Error("Expected direct invitation delivery");
    const [url, init] = call;
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers).toMatchObject({
      Authorization: "Bearer re_test_key",
      "Content-Type": "application/json",
      "User-Agent": "PosPay/1.0",
    });
    expect(init.headers["X-Connection-Api-Key"]).toBeUndefined();
    expect(init.headers["Idempotency-Key"]).toBeUndefined();
    expect(JSON.parse(init.body).from).toBe("PosPay <noreply@pospay.systems>");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reports a rejected direct invitation without exposing its response", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider body", { status: 403 })),
    );
    await expect(
      sendInvitationEmail(
        "test@example.com",
        "https://app.pospay.systems/invite?t=test-token",
        "Test Company",
      ),
    ).resolves.toBe(false);
  });
});

describe("Direct Resend failure privacy", () => {
  it("keeps direct reset failures status-only", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.pospay.systems");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider body", { status: 403 })),
    );
    const sender = getResendPasswordSender();
    if (!sender) throw new Error("Expected direct password sender");
    await expect(sender(data)).rejects.toMatchObject({
      message: "PASSWORD_RESET_DELIVERY_FAILED_403",
    });
  });

  it("keeps direct OTP failures status-only", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("BETTER_AUTH_URL", "https://app.pospay.systems");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("private provider body", { status: 403 })),
    );
    await expect(
      getResendOtpSender()({ email: "test@example.com", otp: "123456", type: "forget-password" }),
    ).rejects.toMatchObject({ message: "EMAIL_OTP_DELIVERY_FAILED_403" });
  });
});
