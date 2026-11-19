import type { LocalizedText, PageBlock, PageDocument } from "../contracts";
/** النص الإنجليزي الفارغ يرجع للعربية. */
export function pageText(text: LocalizedText, lang: "ar" | "en"): string {
  return lang === "en" && text.en.trim() ? text.en : text.ar;
}
/** بلوكات منشورة مرئية بالترتيب الذي حدده المالك. */
export function visibleBlocks(doc: PageDocument): PageBlock[] {
  return doc.blocks.filter((block) => !block.hidden);
}
/** لا تنشر مستنداً لا يحتوي على أي بلوك ظاهر. */
export function assertPublishable(doc: PageDocument): void {
  if (!visibleBlocks(doc).length) throw new Error("PAGE_EMPTY");
}
/** ينقل البلوك خطوة واحدة مع الحفاظ على الحدود وترتيب الباقي. */
export function moveBlock(doc: PageDocument, id: string, direction: -1 | 1): PageDocument {
  const index = doc.blocks.findIndex((b) => b.id === id),
    target = index + direction;
  if (index < 0 || target < 0 || target >= doc.blocks.length) return doc;
  const blocks = [...doc.blocks],
    current = blocks[index],
    other = blocks[target];
  if (!current || !other) return doc;
  blocks[index] = other;
  blocks[target] = current;
  return { ...doc, blocks };
}
/** يخفي أو يظهر البلوك دون حذفه من المسودة. */
export function toggleBlock(doc: PageDocument, id: string): PageDocument {
  return { ...doc, blocks: doc.blocks.map((b) => (b.id === id ? { ...b, hidden: !b.hidden } : b)) };
}
/** ينشئ بلوكاً فارغاً؛ المعرّف يأتي من واجهة المستخدم وليس من ساعة المجال. */
export function addBlock(doc: PageDocument, type: PageBlock["type"], id: string): PageDocument {
  if (doc.blocks.length >= 12) throw new Error("PAGE_LIMIT");
  const base = { id, hidden: false },
    text = { ar: "", en: "" };
  const block: PageBlock =
    type === "hero"
      ? { ...base, type, title: { ...text }, subtitle: { ...text } }
      : type === "about"
        ? { ...base, type, body: { ...text } }
        : type === "services"
          ? { ...base, type, showPrices: true }
          : type === "branches"
            ? { ...base, type, items: [] }
            : type === "gallery"
              ? { ...base, type, images: [] }
            : type === "contact"
              ? { ...base, type, whatsapp: "", phone: "", instagram: "" }
              : { ...base, type: "cta", label: { ...text }, message: { ...text } };
  return { ...doc, blocks: [...doc.blocks, block] };
}
