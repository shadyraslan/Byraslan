"use client";
import * as XLSX from "xlsx";
/** تنزيل التقرير إكسل بنفس الفلاتر */
export default function Export({ rows, name }: { rows: Record<string, unknown>[]; name: string }) {
  return <button className="btn" onClick={() => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "الحجوزات");
    XLSX.writeFile(wb, `${name}.xlsx`);
  }}>⬇ إكسل</button>;
}
