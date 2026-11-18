"use client";
import * as XLSX from "xlsx";
export default function Export({ rows, file = "تقرير-الصلاحيات" }: { rows: Record<string, unknown>[]; file?: string }) {
  const xl = () => { const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "التقرير"); XLSX.writeFile(wb, `${file}.xlsx`); };
  return <div className="row noprint" style={{ gap: 6 }}><button className="btn" onClick={() => window.print()}>🖨 اطبع</button><button className="btn" onClick={xl}>⬇ إكسل</button></div>;
}
