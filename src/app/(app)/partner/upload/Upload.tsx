"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Opt = { loc: string; name: string; map: Record<string, string> };
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

/** بيقرا الإكسل بشكل الأعمدة المحفوظ للشريك ويبعته مسودة للمطابقة */
export default function Upload({ opts }: { opts: Opt[] }) {
  const router = useRouter();
  const [loc, setLoc] = useState(opts[0]?.loc ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async (f: File) => {
    setErr(null); setBusy(true);
    try {
      const o = opts.find((x) => x.loc === loc);
      if (!o) throw new Error("اختار فرع الشريك");
      const wb = XLSX.read(await f.arrayBuffer());
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      if (!rows.length) throw new Error("الملف فاضي");
      const heads = Object.keys(rows[0]);
      const col = (k: string, guess: RegExp) => heads.find((h) => o.map[k] && norm(h) === norm(o.map[k])) ?? heads.find((h) => guess.test(h));
      const c = { code: col("code", /كود|code|sku/i), barcode: col("barcode", /باركود|barcode|ean/i), name: col("name", /اسم|صنف|name|desc/i), qty: col("qty", /كمية|رصيد|qty|stock|quant/i), price: col("price", /سعر|price/i) };
      if (!c.qty || !c.price || (!c.code && !c.barcode)) throw new Error(`مش لاقي أعمدة الكود/الكمية/السعر — الأعمدة اللي في الملف: ${heads.join("، ")}. ظبط شكل الملف من صفحة الشريك.`);
      const data = rows.map((r) => ({ code: String(r[c.code ?? c.barcode!] ?? "").trim(), barcode: c.barcode ? String(r[c.barcode] ?? "").trim() : "", name: c.name ? String(r[c.name] ?? "") : "",
        qty: Number(String(r[c.qty!]).replace(/,/g, "")) || 0, price: Number(String(r[c.price!]).replace(/,/g, "")) || 0 })).filter((r) => r.code);
      const { data: id, error } = await supabaseBrowser().rpc("partner_upload", { p_loc: loc, p_rows: data });
      if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""));
      router.push(`/partner/upload/${id}`);
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <label className="fld">فرع الشريك<select value={loc} onChange={(e) => setLoc(e.target.value)}>{opts.map((o) => <option key={o.loc} value={o.loc}>{o.name}</option>)}</select></label>
      {!opts.length && <div className="muted">ضيف شريك وفرع من صفحة الشريك الأول</div>}
      <input type="file" accept=".xlsx,.xls,.csv" disabled={busy || !loc} onChange={(e) => { const f = e.target.files?.[0]; if (f) go(f); }} />
      {busy && <div className="muted">بيقرا الملف…</div>}
      {err && <div className="badmsg">{err}</div>}
    </div>
  );
}
