"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabaseBrowser } from "@/lib/supabase/client";

type Loc = { id: string; name: string };
type Item = { code: string | null; name: string; arm: string; unit: string | null; sold_by: string | null; kind: string | null; scale_plu: string | null; cost: number | null; shelf_days: number | null; active: boolean; family: string | null; group: string | null; barcodes: string; prices: Record<string, Record<string, number>>; maker?: string | null; size?: string | null; reorder_min?: number | null };
type Res = { rows: number; added: number; updated: number; prices: number; hidden_demo: number; errors: { row: number; name: string; error: string }[]; prices_skipped: boolean; internal?: number; stock?: number };

const ARM: Record<string, string> = { rostos: "روستوز", market: "ماركت", oricci: "تودزي" };
const SOLD: Record<string, string> = { weight: "وزن", piece: "قطعة", pack: "علبة" };
// عناوين الأعمدة الثابتة ← المفتاح
const COLS: [string, string][] = [
  ["الكود", "code"], ["الاسم", "name"], ["البراند", "arm"], ["المجموعة", "group"], ["العائلة", "family"], ["الوحدة", "unit"], ["بيتباع بـ", "sold_by"],
  ["الباركود", "barcodes"], ["الماركة (المُصنّع)", "maker"], ["الحجم / العبوة", "size"], ["المورد", "supplier"], ["حد إعادة الطلب", "reorder_min"],
  ["كود الميزان", "plu"], ["التكلفة", "cost"], ["الصلاحية (يوم)", "shelf_days"], ["شغال", "active"],
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
  const [warn, setWarn] = useState<string[]>([]);

  const headers = [...COLS.map((c) => c[0]), ...locs.flatMap((l) => [`مباشر: ${l.name}`, `تطبيق: ${l.name}`, `رصيد: ${l.name}`])];
  // قالب السوبرماركت: الأعمدة اللي محتاجها بس، والباركود نص عشان الإكسل مايبوّظش الأرقام الطويلة
  const market = () => {
    const H = ["الباركود", "الاسم", "الماركة (المُصنّع)", "الحجم / العبوة", "المجموعة", "العائلة", "بيتباع بـ", "المورد", "التكلفة", "سعر البيع المباشر (كل الفروع)", "سعر التطبيق (كل الفروع)", "حد إعادة الطلب", ...locs.map((l) => `رصيد: ${l.name}`)];
    const ex = [
      { "الباركود": "6221234567890", "الاسم": "زيت عباد الشمس 1 لتر", "الماركة (المُصنّع)": "عافية", "الحجم / العبوة": "1 لتر", "المجموعة": "البقالة", "العائلة": "زيوت", "بيتباع بـ": "قطعة", "المورد": "اسم المورد", "التكلفة": 82, "سعر البيع المباشر (كل الفروع)": 95, "سعر التطبيق (كل الفروع)": 99, "حد إعادة الطلب": 12 },
      { "الباركود": "", "الاسم": "طماطم (سايب)", "المجموعة": "خضار وفاكهة", "العائلة": "خضار", "بيتباع بـ": "وزن", "التكلفة": 12, "سعر البيع المباشر (كل الفروع)": 18 },
    ];
    const ws = XLSX.utils.json_to_sheet(ex, { header: H });
    ws["!cols"] = H.map((h) => ({ wch: Math.max(14, h.length + 2) }));
    for (let r = 1; r <= 500; r++) { const a = XLSX.utils.encode_cell({ r, c: 0 }); ws[a] = ws[a] ?? { t: "s", v: "" }; ws[a].z = "@"; ws[a].t = "s"; }
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 500, c: H.length - 1 } });
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "الأصناف");
    XLSX.writeFile(wb, "قالب-السوبرماركت.xlsx");
  };
  const download = (withData: boolean) => {
    const data = withData && items.length ? items.map((i) => {
      const o: Record<string, unknown> = { "الكود": i.code ?? "", "الاسم": i.name, "البراند": ARM[i.arm] ?? i.arm, "المجموعة": i.group ?? "", "العائلة": i.family ?? "", "الوحدة": i.unit ?? "",
        "بيتباع بـ": SOLD[i.sold_by ?? ""] ?? "", "الباركود": i.barcodes, "كود الميزان": i.scale_plu ?? "", "التكلفة": i.cost ?? "", "الصلاحية (يوم)": i.shelf_days ?? "", "شغال": i.active ? "أيوه" : "لا",
        "الماركة (المُصنّع)": i.maker ?? "", "الحجم / العبوة": i.size ?? "", "حد إعادة الطلب": i.reorder_min ?? "",
        "سعر البيع المباشر (كل الفروع)": "", "سعر التطبيق (كل الفروع)": "" };
      for (const l of locs) { o[`مباشر: ${l.name}`] = i.prices[l.id]?.direct ?? ""; o[`تطبيق: ${l.name}`] = i.prices[l.id]?.app ?? ""; }
      return o;
    }) : [
      { "الكود": "M-001", "الاسم": "زيت عباد الشمس 1 لتر", "البراند": "ماركت", "المجموعة": "البقالة", "العائلة": "زيوت", "الوحدة": "قطعة", "بيتباع بـ": "قطعة", "الباركود": "6221234567890", "شغال": "أيوه", "سعر البيع المباشر (كل الفروع)": 95, "سعر التطبيق (كل الفروع)": 99 },
      { "الكود": "R-010", "الاسم": "صدور فراخ متبلة", "البراند": "روستوز", "المجموعة": "الدواجن", "العائلة": "صدور", "الوحدة": "كجم", "بيتباع بـ": "وزن", "كود الميزان": "00123", "الصلاحية (يوم)": 4, "شغال": "أيوه", "سعر البيع المباشر (كل الفروع)": 260, "سعر التطبيق (كل الفروع)": 270 },
    ];
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const bc = headers.indexOf("الباركود");
    for (let r = 1; r <= data.length; r++) { const a = XLSX.utils.encode_cell({ r, c: bc }); if (ws[a]) { ws[a].t = "s"; ws[a].v = String(ws[a].v ?? ""); ws[a].z = "@"; } }
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
          // الباركود لو الإكسل حوّله رقم: نرجّعه نص من غير كسور ولا E+
          const val = typeof v === "string" ? v.trim() : typeof v === "number" && /باركود/.test(key) ? BigInt(Math.round(v)).toString() : v;
          if (c) o[c[1]] = c[1] === "active" ? !/^(لا|no|0|false|متوقف)$/i.test(String(val)) : String(val ?? "");
          const m = key.match(/^(مباشر|تطبيق)\s*:\s*(.+)$/);
          if (m && String(val) !== "") { const id = byName.get(m[2].trim()); if (id) (prices[id] ??= {})[m[1] === "مباشر" ? "direct" : "app"] = String(val); }
          const st = key.match(/^رصيد\s*:\s*(.+)$/);
          if (st && String(val) !== "") { const id = byName.get(st[1].trim()); if (id) ((o.stock ??= {}) as Record<string, number>)[id] = Number(val); }
        }
        if (Object.keys(prices).length) o.prices = prices;
        return o;
      }).filter((o) => String(o.name ?? "").trim() !== "");
      if (!out.length) throw new Error("مفيش صفوف فيها اسم صنف — اتأكد إن أول سطر هو عناوين الأعمدة زي القالب");
      // مراجعة قبل الرفع: باركود متكرر في الملف أو رقمه غلط
      const seen = new Map<string, string>(); const w: string[] = [];
      for (const o of out) for (const b of String(o.barcodes ?? "").split(/[,،;\s]+/).filter(Boolean)) {
        if (seen.has(b)) w.push(`الباركود ${b} متكرر: "${seen.get(b)}" و"${o.name}"`); else seen.set(b, String(o.name));
        if (/^\d{13}$/.test(b)) { const d = b.split("").map(Number); const c = (10 - (d.slice(0, 12).reduce((a, x, i) => a + x * (i % 2 ? 3 : 1), 0) % 10)) % 10; if (c !== d[12]) w.push(`الباركود ${b} ("${o.name}") رقمه الأخير مش مظبوط — اتأكد منه`); }
        else if (/^\d+$/.test(b) && ![8, 12, 13, 14].includes(b.length)) w.push(`الباركود ${b} ("${o.name}") طوله ${b.length} رقم — غالبًا الإكسل شال أصفار من أوله`);
      }
      setWarn(w);
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
          <button className="btn" onClick={market}>⬇ قالب السوبرماركت (بالباركود)</button>
        </div>
        <div className="muted" style={{ marginTop: 6 }}>
          السوبرماركت: امسح باركود كل منتج في عمود الباركود (الإسكانر بيكتب في الخانة على طول). الصنف اللي بالقطعة ومالوش باركود السيستم بيعمله باركود داخلي (بيبدأ بـ 20) تطبعه من الملصقات، والسايب بالوزن بيتباع بكود الميزان.
          لو رفعت نفس الباركود تاني الصنف بيتعدّل مش بيتكرر، والباركود المتسجّل على صنف تاني بيطلع غلط ومش بيتنقل. "رصيد: الفرع" بيظبط رصيد أول المدة (محتاج صلاحية التسويات).
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
            {!!warn.length && <div className="badmsg" style={{ marginTop: 8, maxHeight: 160, overflow: "auto" }}><b>راجع قبل الرفع:</b>{warn.map((x, i) => <div key={i}>{x}</div>)}</div>}
            <label className="row" style={{ gap: 6, margin: "8px 0" }}><input type="checkbox" checked={hideDemo} onChange={(e) => setHideDemo(e.target.checked)} style={{ width: 20, height: 20 }} /> وقّف الأصناف التجريبية (بتختفي من التطبيق والكاشير، مش بتتمسح)</label>
            <button className="btn pri" onClick={upload} disabled={busy}>{busy ? "بيترفع…" : `ارفع ${rows.length} صنف`}</button>
          </div>
        )}
        {err && <div className="badmsg" style={{ marginTop: 8 }}>{err}</div>}
        {res && (
          <div className="okmsg" style={{ marginTop: 8 }}>
            اتضاف {res.added} · اتعدّل {res.updated} · أسعار {res.prices}{res.internal ? ` · باركود داخلي لـ ${res.internal} صنف` : ""}{res.stock ? ` · رصيد ${res.stock}` : ""}{res.hidden_demo ? ` · اتوقف ${res.hidden_demo} صنف تجريبي` : ""}
            {!!res.internal && <div><a href="/items/labels">اطبع ملصقات الباركود الداخلي ←</a></div>}
            {res.prices_skipped && <div>الأسعار ماتسجلتش — محتاج صلاحية الأسعار.</div>}
          </div>
        )}
        {!!res?.errors.length && <div className="badmsg" style={{ marginTop: 8 }}>{res.errors.map((e) => <div key={e.row}>سطر {e.row} ({e.name || "من غير اسم"}): {e.error}</div>)}</div>}
      </div>
    </>
  );
}
