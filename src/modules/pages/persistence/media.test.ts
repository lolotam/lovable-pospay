// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/server/db.server", () => ({ withUser: async (_id: string, run: (db: unknown) => Promise<unknown>) => run({ query: mocks.query }) }));
vi.mock("@/lib/server/session.server", () => ({ requireSession: mocks.session }));
import { serveAsset } from "./media.server";
const config = { endpoint: "https://r2.example.test", bucket: "pages", region: "auto", accessKeyId: "test-id", secretAccessKey: "test-secret" };
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });
it("returns 404 for an unpublished image to an anonymous visitor without fetching R2", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.session.mockRejectedValue(new Error("UNAUTHENTICATED"));
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await serveAsset("asset", config)).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
it("returns 404 for another company's private image", async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  mocks.session.mockResolvedValue({ user: { id: "foreign-user" } });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  expect((await serveAsset("asset", config)).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
});
it("serves published bytes with immutable cache and nosniff", async () => {
  mocks.query.mockResolvedValue({ rows: [{ object_key: "companies/a/pages/photo.png", content_type: "image/png" }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(Uint8Array.from([137, 80, 78, 71]))));
  const response = await serveAsset("asset", config);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(response.headers.get("Content-Type")).toBe("image/png");
  expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([137, 80, 78, 71]);
});
it("serves owner preview bytes without public caching", async () => {
  mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ object_key: "photo.jpg", content_type: "image/jpeg" }] });
  mocks.session.mockResolvedValue({ user: { id: "owner" } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("image")));
  const response = await serveAsset("asset", config);
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("returns 404 when R2 refuses or cannot find the published object", async () => {
  mocks.query.mockResolvedValue({ rows: [{ object_key: "photo.png", content_type: "image/png" }] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  expect((await serveAsset("asset", config)).status).toBe(404);
});