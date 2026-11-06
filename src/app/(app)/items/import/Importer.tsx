"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "@/lib/supabase/client";

type Loc = { id: string; name: string };
type Item = { code: string | null; name: string; arm: string; unit: string | null; sold_by: string | null; kind: string | null; scale_plu: string | null; cost: number | null; shelf_days: number | null; active: boolean; family: string | null; group: string | null; barcodes: string; prices: Record<string, Record<string, number>> };
type Res = { rows: number; added: number; updated: number; prices: number; hidden_demo: number; errors: { row: number; name: string; error: string }[]; prices_skipped: boolean };

const ARM: Record<string, string> = { rostos: "روستوز", market: "ماركت", oricci: "تودزي" };
const SOLD: Record<string, string> = { weight: "وزن", piece: "قطعة", pack: "علبة" };
// عناوين الأعمدة الثابتة ← المفتاح
const COLS: [string, string][] = [
  ["الكود", "code"], ["الاسم", "name"], ["البراند", "arm"], ["المجموعة", "group"], ["العائلة", "family"], ["الوحدة", "unit"], ["بيتباع بـ", "sold_by"],
  ["الباركود", "barcodes"], ["كود الميزان", "plu"], ["التكلفة", "cost"], ["الصلاحية (يوم)", "shelf_days"], ["شغال", "active"],
  ["سعر البيع المباشر (كل الفروع)", "price_direct"], ["سعر التطبيق (كل الفروع)", "price_app"],
];

/** رفع الأصناف والعائلات والباركود والأسعار من ملف إكسل واحد — ونفس الملف بيتنزّل بالموجود عشان تعدّل عليه */
export default function Importer({ items, locs }: { items: Item[]; locs: Loc[] }) {
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fname, setFname] = useState("");
  const [hideDemo, setHideDemo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const headers = [...COLS.map((c) => c[0]), ...locs.flatMap((l) => [`مباشر: ${l.name}`, `تطبيق: ${l.name}`])];
  const download = (withData: boolean) => {
    const data = withData && items.length ? items.map((i) => {
      const o: Record<string, unknown> = { "الكود": i.code ?? "", "الاسم": i.name, "البراند": ARM[i.arm] ?? i.arm, "المجموعة": i.group ?? "", "العائلة": i.family ?? "", "الوحدة": i.unit ?? "",
        "بيتباع بـ": SOLD[i.sold_by ?? ""] ?? "", "الباركود": i.barcodes, "كود الميزان": i.scale_plu ?? "", "التكلفة": i.cost ?? "", "الصلاحية (يوم)": i.shelf_days ?? "", "شغال": i.active ? "أيوه" : "لا",
        "سعر البيع المباشر (كل الفروع)": "", "سعر التطبيق (كل الفروع)": "" };
      for (const l of locs) { o[`مباشر: ${l.name}`] = i.prices[l.id]?.direct ?? ""; o[`تطبيق: ${l.name}`] = i.prices[l.id]?.app ?? ""; }
      return o;
    }) : [
      { "الكود": "M-001", "الاسم": "زيت عباد الشمس 1 لتر", "البراند": "ماركت", "المجموعة": "البقالة", "العائلة": "زيوت", "الوحدة": "قطعة", "بيتباع بـ": "قطعة", "الباركود": "6221234567890", "شغال": "أيوه", "سعر البيع المباشر (كل الفروع)": 95, "سعر التطبيق (كل الفروع)": 99 },
      { "الكود": "R-010", "الاسم": "صدور فراخ متبلة", "البراند": "روستوز", "المجموعة": "الدواجن", "العائلة": "صدور", "الوحدة": "كجم", "بيتباع بـ": "وزن", "كود الميزان": "00123", "الصلاحية (يوم)": 4, "شغال": "أيوه", "سعر البيع المباشر (كل الفروع)": 260, "سعر التطبيق (كل الفروع)": 270 },
    ];
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.writeFile(wb, withData ? "أصناف-باي-رسلان.xlsx" : "قالب-الأصناف.xlsx");
  };

  const read = async (f: File | undefined) => {
    setErr(null); setRes(null); setRows(null);
    if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer());
      const sh = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sh, { defval: "" });
      const byName = new Map(locs.map((l) => [l.name.trim(), l.id]));
      const out = raw.map((r) => {
        const o: Record<string, unknown> = {};
        const prices: Record<string, Record<string, string>> = {};
        for (const [h, v] of Object.entries(r)) {
          const key = h.trim();
          const c = COLS.find((x) => x[0] === key);
          const val = typeof v === "string" ? v.trim() : v;
          if (c) o[c[1]] = c[1] === "active" ? !/^(لا|no|0|false|متوقف)$/i.test(String(val)) : String(val ?? "");
          const m = key.match(/^(مباشر|تطبيق)\s*:\s*(.+)$/);
          if (m && String(val) !== "") { const id = byName.get(m[2].trim()); if (id) (prices[id] ??= {})[m[1] === "مباشر" ? "direct" : "app"] = String(val); }
        }
        if (Object.keys(prices).length) o.prices = prices;
        return o;
      }).filter((o) => String(o.name ?? "").trim() !== "");
      if (!out.length) throw new Error("مفيش صفوف فيها اسم صنف — اتأكد إن أول سطر هو عناوين الأعمدة زي القالب");
      setRows(out); setFname(f.name);
    } catch (e) { setErr((e as Error).message); }
  };

  const upload = async () => {
    if (!rows) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabaseBrowser().rpc("items_import", { p_rows: rows, p_hide_demo: hideDemo });
    setBusy(false);
    if (error) return setErr(error.message.replace(/^.*?ERROR:\s*/, ""));
    setRes(data as Res); setRows(null);
  };

  return (
    <>
      <div className="card">
        <h2>١. نزّل الملف</h2>
        <div className="row">
          <button className="btn pri" onClick={() => download(true)}>⬇ نزّل الأصناف الموجودة (عدّل عليها)</button>
          <button className="btn" onClick={() => download(false)}>⬇ قالب فاضي بمثال</button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          كل صنف في سطر. الكود اختياري بس بيخلّي التعديل أدق. البراند: روستوز / ماركت / تودزي. بيتباع بـ: وزن / قطعة / علبة. أكتر من باركود: افصل بينهم بفاصلة.
          السعر في عمود "كل الفروع" بيتحط لكل الفروع، وأعمدة "مباشر: الفرع" و"تطبيق: الفرع" لو فرع سعره مختلف. العائلات والمجموعات اللي مش موجودة بتتعمل لوحدها.
        </div>
      </div>
      <div className="card">
        <h2>٢. ارفعه</h2>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => read(e.target.files?.[0])} />
        {rows && (
          <div style={{ marginTop: 10 }}>
            <b>{fname}: {rows.length} صنف جاهز</b>
            <div className="muted" style={{ maxHeight: 160, overflow: "auto" }}>{rows.slice(0, 30).map((r, i) => <div key={i}>{String(r.name)} {r.price_direct ? `· ${r.price_direct} ج` : ""}</div>)}{rows.length > 30 ? "…" : ""}</div>
            <label className="row" style={{ gap: 6, margin: "8px 0" }}><input type="checkbox" checked={hideDemo} onChange={(e) => setHideDemo(e.target.checked)} style={{ width: 20, height: 20 }} /> وقّف الأصناف التجريبية (بتختفي من التطبيق والكاشير، مش بتتمسح)</label>
            <button className="btn pri" onClick={upload} disabled={busy}>{busy ? "بيترفع…" : `ارفع ${rows.length} صنف`}</button>
          </div>
        )}
        {err && <div className="badmsg" style={{ marginTop: 8 }}>{err}</div>}
        {res && (
          <div className="okmsg" style={{ marginTop: 8 }}>
            اتضاف {res.added} · اتعدّل {res.updated} · أسعار {res.prices}{res.hidden_demo ? ` · اتوقف ${res.hidden_demo} صنف تجريبي` : ""}
            {res.prices_skipped && <div>الأسعار ماتسجلتش — محتاج صلاحية الأسعار.</div>}
          </div>
        )}
        {!!res?.errors.length && <div className="badmsg" style={{ marginTop: 8 }}>{res.errors.map((e) => <div key={e.row}>سطر {e.row} ({e.name || "من غير اسم"}): {e.error}</div>)}</div>}
      </div>
    </>
  );
}
