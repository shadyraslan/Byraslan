"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { LabelStyles, ShelfLabel, StickerLabel } from "@/components/ShelfLabel";
import { A4Sheets, fillPage, pagesFor, perPage } from "@/components/A4Sheets";

export type LI = { id: number; name: string; unit: string; size: string | null; maker: string | null; family: number | null; code: string | null; internal: boolean; price: number | null; last: number | null; printed: string | null };

/** اختار الأصناف ← عدد النسخ ← اطبع. بعد الطباعة السعر بيتسجّل عشان نعرف بعدين مين اتغيّر */
export default function Labels({ items, locs, loc, fams }: { items: LI[]; locs: { id: string; name: string }[]; loc: string; fams: { id: number; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState<"changed" | "all" | "internal">("changed");
  const [fam, setFam] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"shelf" | "sticker">("shelf");
  const [sel, setSel] = useState<Record<number, number>>({});
  const [fill, setFill] = useState(true);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const changed = (i: LI) => i.last == null || i.last !== i.price;
  const L = useMemo(() => items.filter((i) => (f === "all" || (f === "changed" ? changed(i) : i.internal)) && (!fam || String(i.family) === fam) && (!q || i.name.includes(q) || (i.code ?? "").includes(q))), [items, f, fam, q]);
  const picked = items.filter((i) => sel[i.id] > 0);
  const all = () => setSel(Object.fromEntries(L.map((i) => [i.id, sel[i.id] || 1])));
  const print = async () => {
    window.print();
    await supabaseBrowser().from("label_prints").upsert(picked.map((i) => ({ item_id: i.id, location_id: loc, price: i.price, at: new Date().toISOString() })));
    setSel({}); router.refresh();
  };
  const base = picked.flatMap((i) => Array.from({ length: sel[i.id] }, () => i));
  const list = fill ? fillPage(base, kind) : base;
  const Sheets = () => (
    <A4Sheets kind={kind} cells={list.map((i, k) => {
      const d = { name: i.name, size: i.size, maker: i.maker, unit: i.unit, price: i.price, code: i.code };
      return kind === "shelf" ? <ShelfLabel key={k} d={d} branch={locs.find((l) => l.id === loc)?.name} /> : <StickerLabel key={k} d={d} />;
    })} />
  );
  const money = (n: number | null) => (n == null ? "" : n.toLocaleString("ar-EG", { maximumFractionDigits: 2 }));
  return (
    <>
      <style>{`@media print { body > *:not(.prt) { display: none !important } .prt { display: block !important } body { background: #fff !important } }
        @media screen { .prt { display: none } }`}</style>
      <LabelStyles />
      <div className="top"><h1>ملصقات الباركود والأسعار</h1></div>
      <div className="card row" style={{ alignItems: "end" }}>
        <label className="fld">الفرع (سعر الكاشير)<select value={loc} onChange={(e) => router.push(`/items/labels?loc=${e.target.value}`)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">العائلة<select value={fam} onChange={(e) => setFam(e.target.value)}><option value="">الكل</option>{fams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="fld" style={{ flex: 1 }}>دوّر<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو باركود" /></label>
        <label className="fld">الشكل<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="shelf">ملصق رف 70×38</option><option value="sticker">ملصق منتج 40×26</option></select></label>
      </div>
      <div className="row" style={{ gap: 6, margin: "8px 0" }}>
        {([["changed", `سعرها اتغيّر أو ماتطبعتش (${items.filter(changed).length})`], ["internal", "باركود داخلي"], ["all", "الكل"]] as const).map(([k, l]) => <button key={k} className={f === k ? "btn pri" : "btn"} onClick={() => setF(k)}>{l}</button>)}
        <button className="btn" onClick={all}>اختار كل اللي ظاهر</button>
        <label className="row" style={{ gap: 4, fontSize: 14 }}><input type="checkbox" checked={fill} onChange={(e) => setFill(e.target.checked)} /> كمّل آخر ورقة بتكرار الأصناف</label>
        <button className="btn pri" disabled={!picked.length} onClick={print}>🖨 اطبع {list.length} ملصق ({pagesFor(kind, list.length)} ورقة A4 · {perPage(kind)} في الورقة)</button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>نسخ</th><th>الصنف</th><th>الباركود</th><th>السعر</th><th>آخر طباعة</th></tr></thead>
          <tbody>{L.map((i) => (
            <tr key={i.id}>
              <td><input type="number" min={0} value={sel[i.id] ?? 0} onChange={(e) => setSel({ ...sel, [i.id]: Math.max(0, Number(e.target.value)) })} style={{ width: 60 }} /></td>
              <td><b>{i.name}</b> <span className="muted">{[i.maker, i.size].filter(Boolean).join(" · ")}</span></td>
              <td dir="ltr" className="muted">{i.code ?? "مالوش باركود"}{i.internal ? " (داخلي)" : ""}</td>
              <td className="num">{money(i.price)}{i.last != null && i.last !== i.price && <div className="muted" style={{ fontSize: 12 }}>كان {money(i.last)}</div>}</td>
              <td className="muted">{i.printed ? new Date(i.printed).toLocaleDateString("ar-EG") : "لسه"}</td>
            </tr>
          ))}{!L.length && <tr><td colSpan={5} className="muted">مفيش أصناف محتاجة ملصقات 👌</td></tr>}</tbody>
        </table>
      </div>
      {picked.length > 0 && (
        <details className="card" style={{ marginTop: 8 }}><summary>معاينة الورق قبل الطباعة</summary>
          <div style={{ overflowX: "auto", paddingTop: 8 }}><Sheets /></div></details>)}
      {mounted && picked.length > 0 && createPortal(<div className="prt" dir="rtl"><LabelStyles /><Sheets /></div>, document.body)}
    </>
  );
}
