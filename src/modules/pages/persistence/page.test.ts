// @vitest-environment node
import type pg from "pg";
import { expect, it, vi } from "vitest";
import { pgPageRepository } from "./page.server";
const company = "92000000-0000-4000-8000-000000000001";
const image = "92000000-0000-4000-8000-000000000002";
function setup(write: { rowCount: number } | Error = { rowCount: 1 }) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("select name,currency")) return { rows: [{ name: "Glow", currency: "KWD" }] };
    if (sql.includes("select slug,draft"))
      return { rows: [{ slug: "glow-salon", document: { blocks: [] }, version: 2 }] };
    if (
      sql.startsWith("insert into public.company_pages") ||
      sql.startsWith("update public.company_pages")
    ) {
      if (write instanceof Error) throw write;
      return { ...write, rows: [] };
    }
    return { rows: [] };
  });
  const db = { query } as unknown as pg.PoolClient;
  return { repo: pgPageRepository(db, company, "owner"), query };
}
it("refuses foreign asset references before writing a page", async () => {
  const { repo, query } = setup();
  await expect(
    repo.save({ slug: "glow-salon", version: 1, document: { blocks: [], logoAssetId: image } }),
  ).rejects.toThrow("FOREIGN_ASSET");
  expect(query.mock.calls.some(([sql]) => sql.startsWith("update"))).toBe(false);
  expect(query).toHaveBeenCalledWith("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `page-assets:${company}`,
  ]);
});
it("refuses a stale version", async () => {
  const { repo } = setup({ rowCount: 0 });
  await expect(
    repo.save({ slug: "glow-salon", version: 1, document: { blocks: [] } }),
  ).rejects.toThrow("PAGE_CONFLICT");
});
it("maps a unique slug failure to SLUG_TAKEN", async () => {
  const { repo } = setup(Object.assign(new Error("duplicate"), { code: "23505" }));
  await expect(
    repo.save({ slug: "glow-salon", version: 1, document: { blocks: [] } }),
  ).rejects.toThrow("SLUG_TAKEN");
});
it("publishes the given snapshot only at the expected version under the asset lock", async () => {
  const { repo, query } = setup();
  await repo.publish(1, { blocks: [] });
  expect(query).toHaveBeenCalledWith(expect.stringContaining("set published=$4::jsonb"), [
    company,
    "owner",
    1,
    JSON.stringify({ blocks: [] }),
  ]);
  expect(query.mock.calls[0]?.[0]).toContain("pg_advisory_xact_lock");
});
