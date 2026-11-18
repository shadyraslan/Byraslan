"use client";
import * as XLSX from "xlsx";
export default function Tools({ name, rows, print }: { name: string; rows: Record<string, unknown>[]; print: string }) {
  const xl = () => { const ws = XLSX.utils.json_to_sheet(rows); const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "كشف حساب"); XLSX.writeFile(wb, `كشف-حساب-${name}.xlsx`); };
  return <div className="row" style={{ gap: 6 }}><a className="btn" href={print} target="_blank" rel="noreferrer" style={{ display: "inline-grid", placeItems: "center" }}>🖨 كشف حساب للطباعة</a><button className="btn" onClick={xl}>⬇ إكسل</button></div>;
}
