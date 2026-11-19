import type { Table } from "./report-export";

/** عدد الصفوف في كل صفحة A4 أفقية حتى لا تنقسم الصفوف بين الصفحات. */
export const ROWS_PER_PAGE = 18;
export function chunkRows<T>(rows: T[], size = ROWS_PER_PAGE): T[][] {
  if (!rows.length) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function pageNode(table: Table, rows: string[][], rangeLabel: string, page: string): HTMLElement {
  const root = document.createElement("div");
  root.dir = "rtl";
  root.style.cssText =
    "position:fixed;inset-inline-start:-10000px;inset-block-start:0;inline-size:1120px;padding:24px;background:#fff;color:#111;font-family:var(--font-sans);font-size:13px";
  const h = document.createElement("h1");
  h.textContent = table.title;
  h.style.cssText = "font-family:inherit;font-size:20px;margin:0 0 4px";
  const p = document.createElement("p");
  p.textContent = `${rangeLabel} · ${page}`;
  p.style.cssText = "margin:0 0 12px;color:#555";
  const tbl = document.createElement("table");
  tbl.style.cssText = "border-collapse:collapse;inline-size:100%";
  const cell = (tag: "th" | "td", text: string) => {
    const c = document.createElement(tag);
    c.textContent = text;
    c.style.cssText = `border:1px solid #999;padding:6px;text-align:start;${tag === "th" ? "background:#eee" : ""}`;
    return c;
  };
  const head = tbl.insertRow();
  table.head.forEach((x) => head.appendChild(cell("th", x)));
  rows.forEach((r) => {
    const tr = tbl.insertRow();
    r.forEach((x) => tr.appendChild(cell("td", x)));
  });
  root.append(h, p, tbl);
  return root;
}

/** ينشئ ملف PDF من نفس بيانات التقرير المعروضة وينزّله مباشرة. */
export async function downloadPdf(table: Table, rangeLabel: string, name: string) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas-pro"),
  ]);
  await document.fonts?.ready;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pages = chunkRows(table.body);
  for (const [i, rows] of pages.entries()) {
    const node = pageNode(table, rows, rangeLabel, `${i + 1}/${pages.length}`);
    document.body.appendChild(node);
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
      if (i) pdf.addPage();
      const w = 287;
      const h = Math.min(200, (canvas.height * w) / canvas.width);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 5, 5, w, h);
    } finally {
      node.remove();
    }
  }
  pdf.save(`${name}.pdf`);
}
