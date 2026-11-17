"use client";
// ملف إكسل فيه قوايم اختيارات (Dropdown) للخانات اللي ليها اختيارات محددة — عشان السيستم يقدر يقرا القيم ويطابقها
type Opts = { file: string; sheet: string; headers: string[]; rows: Record<string, unknown>[]; textCols?: string[]; lists?: Record<string, string[]>; emptyRows?: number };

export async function downloadXlsx({ file, sheet, headers, rows, textCols = [], lists = {}, emptyRows = 500 }: Opts) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet, { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(14, h.length + 4), style: textCols.includes(h) ? { numFmt: "@" } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5C800" } };
  for (const r of rows) ws.addRow(headers.map((h) => (textCols.includes(h) && r[h] != null && r[h] !== "" ? String(r[h]) : r[h] ?? "")));
  // القوايم في شيت مخفي
  const names = Object.keys(lists).filter((k) => headers.includes(k) && lists[k].length);
  if (names.length) {
    const ls = wb.addWorksheet("القوايم", { state: "veryHidden" });
    names.forEach((n, ci) => {
      const col = ci + 1;
      ls.getCell(1, col).value = n;
      [...new Set(lists[n])].forEach((v, ri) => { ls.getCell(ri + 2, col).value = v; });
      const letter = ls.getColumn(col).letter;
      const last = new Set(lists[n]).size + 1;
      const hc = headers.indexOf(n) + 1;
      const upto = Math.max(rows.length + emptyRows, 200);
      for (let r = 2; r <= upto + 1; r++) {
        ws.getCell(r, hc).dataValidation = {
          type: "list", allowBlank: true, formulae: [`'القوايم'!$${letter}$2:$${letter}$${last}`],
          showErrorMessage: true, errorStyle: "stop", errorTitle: "اختار من القايمة", error: `«${n}» لازم تتختار من القايمة — لو قيمة جديدة ضيفها في السيستم الأول`,
        };
      }
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = file; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
