"use client";

type ExportRow = { section: string; label: string; count: number | string; value: number | string };

export default function ReportExport({ rows }: { rows: ExportRow[] }) {
  function download() {
    const quote = (value: number | string) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [
      ["القسم", "البيان", "العدد", "القيمة"],
      ...rows.map((row) => [row.section, row.label, row.count, row.value]),
    ]
      .map((row) => row.map(quote).join(","))
      .join("\r\n");
    const file = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "by-raslan-statistics.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button className="btn" type="button" onClick={download} disabled={!rows.length}>
      تصدير CSV
    </button>
  );
}
