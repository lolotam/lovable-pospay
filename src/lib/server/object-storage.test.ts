// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { objectStorage } from "./object-storage.server";
const config = {
  endpoint: "https://r2.example.test",
  bucket: "pages",
  region: "auto",
  accessKeyId: "test-id",
  secretAccessKey: "test-secret",
};
afterEach(() => vi.unstubAllGlobals());
it("signs PUT/GET/DELETE at the fetch boundary and encodes keys", async () => {
  const requests: Request[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request) => {
      requests.push(request);
      return new Response("image", { status: 200 });
    }),
  );
  const storage = objectStorage(config);
  await storage.putObject("companies/a/pages/photo 1.png", Uint8Array.from([137, 80]), "image/png");
  await storage.getObject("companies/a/pages/photo 1.png");
  await storage.deleteObject("companies/a/pages/photo 1.png");
  expect(requests.map((r) => r.method)).toEqual(["PUT", "GET", "DELETE"]);
  for (const request of requests) {
    expect(request.url).toBe("https://r2.example.test/pages/companies/a/pages/photo%201.png");
    expect(request.headers.get("Authorization")).toContain("AWS4-HMAC-SHA256");
  }
  expect(requests[0]?.headers.get("Content-Type")).toBe("image/png");
  const first = requests[0];
  if (!first) throw new Error("Missing upload request");
  expect([...new Uint8Array(await first.arrayBuffer())]).toEqual([137, 80]);
});
it("refuses non-OK storage responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("denied", { status: 403 })),
  );
  await expect(objectStorage(config).getObject("asset.png")).rejects.toThrow("STORAGE_FAILED");
});
