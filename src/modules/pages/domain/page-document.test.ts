import { expect, it } from "vitest";
import { addBlock, moveBlock, toggleBlock, assertPublishable, pageText } from "./page-document";
import { pageDocumentSchema } from "../contracts";
const id = "92000000-0000-4000-8000-000000000001";
it("thirteenth block is refused", () => {
  const doc = { blocks: [] };
  const full = Array.from({ length: 12 }, () => addBlock({ blocks: [] }, "hero", id).blocks[0]);
  expect(() => pageDocumentSchema.parse({ blocks: [...full, full[0]] })).toThrow();
  expect(() => addBlock({ blocks: full } as ReturnType<typeof addBlock>, "hero", id)).toThrow(
    "PAGE_LIMIT",
  );
  expect(doc.blocks).toHaveLength(0);
});
it("move up at start is a no-op", () => {
  const doc = addBlock({ blocks: [] }, "hero", id);
  expect(moveBlock(doc, id, -1)).toBe(doc);
});
it("hiding all blocks prevents publication", () => {
  const doc = toggleBlock(addBlock({ blocks: [] }, "hero", id), id);
  expect(() => assertPublishable(doc)).toThrow("PAGE_EMPTY");
});
it("English blank falls back to Arabic", () =>
  expect(pageText({ ar: "الصالون", en: "" }, "en")).toBe("الصالون"));
it("about rejects more than 1000 characters", () =>
  expect(() =>
    pageDocumentSchema.parse({
      blocks: [{ id, type: "about", hidden: false, body: { ar: "x".repeat(1001), en: "" } }],
    }),
  ).toThrow());
