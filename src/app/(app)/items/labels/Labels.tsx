"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { barcodeSvg } from "@/lib/barcode";

export type LI = { id: number; name: string; unit: string; size: string | null; maker: string | null; family: number | null; code: string | null; internal: boolean; price: number | null; last: number | null; printed: string | null };

/** اختار الأصناف ← عدد النسخ ← اطبع. بعد الطباعة السعر بيتسجّل عشان نعرف بعدين مين اتغيّر */
export default function Labels({ items, locs, loc, fams }: { items: LI[]; locs: { id: string; name: string }[]; loc: string; fams: { id: number; name: string }[] }) {
  const router = useRouter();
  const [f, setF] = useState<"changed" | "all" | "internal">("changed");
  const [fam, setFam] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"shelf" | "sticker">("shelf");
  const [sel, setSel] = useState<Record<number, number>>({});
  const changed = (i: LI) => i.last == null || i.last !== i.price;
  const L = useMemo(() => items.filter((i) => (f === "all" || (f === "changed" ? changed(i) : i.internal)) && (!fam || String(i.family) === fam) && (!q || i.name.includes(q) || (i.code ?? "").includes(q))), [items, f, fam, q]);
  const picked = items.filter((i) => sel[i.id] > 0);
  const all = () => setSel(Object.fromEntries(L.map((i) => [i.id, sel[i.id] || 1])));
  const print = async () => {
    window.print();
    await supabaseBrowser().from("label_prints").upsert(picked.map((i) => ({ item_id: i.id, location_id: loc, price: i.price, at: new Date().toISOString() })));
    setSel({}); router.refresh();
  };
  const money = (n: number | null) => (n == null ? "" : n.toLocaleString("ar-EG", { maximumFractionDigits: 2 }));
  return (
    <>
      <style>{`@media print { body * { visibility: hidden } #lbl, #lbl * { visibility: visible } #lbl { position: absolute; inset: 0 } .side, .mbar { display: none } }
        #lbl { display: flex; flex-wrap: wrap; gap: 4mm }
        .lb { border: 1px dashed #bbb; padding: 2mm; break-inside: avoid; display: grid; justify-items: center; gap: 1mm; font-family: inherit }
        .lb.shelf { width: 62mm; height: 34mm } .lb.sticker { width: 38mm; height: 25mm }
        .lb .n { font-weight: 700; font-size: 11px; text-align: center; line-height: 1.2; max-height: 2.4em; overflow: hidden }
        .lb .p { font-weight: 900; font-size: 20px } .lb.sticker .p { font-size: 14px }
        .lb svg { max-width: 100%; height: 11mm } .lb .c { font-size: 9px; letter-spacing: 1px; direction: ltr }`}</style>
      <div className="top"><h1>ملصقات الباركود والأسعار</h1></div>
      <div className="card row" style={{ alignItems: "end" }}>
        <label className="fld">الفرع (سعر الكاشير)<select value={loc} onChange={(e) => router.push(`/items/labels?loc=${e.target.value}`)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">العائلة<select value={fam} onChange={(e) => setFam(e.target.value)}><option value="">الكل</option>{fams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="fld" style={{ flex: 1 }}>دوّر<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="اسم أو باركود" /></label>
        <label className="fld">الشكل<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="shelf">ملصق رف 62×34</option><option value="sticker">ملصق منتج 38×25</option></select></label>
      </div>
      <div className="row" style={{ gap: 6, margin: "8px 0" }}>
        {([["changed", `سعرها اتغيّر أو ماتطبعتش (${items.filter(changed).length})`], ["internal", "باركود داخلي"], ["all", "الكل"]] as const).map(([k, l]) => <button key={k} className={f === k ? "btn pri" : "btn"} onClick={() => setF(k)}>{l}</button>)}
        <button className="btn" onClick={all}>اختار كل اللي ظاهر</button>
        <button className="btn pri" disabled={!picked.length} onClick={print}>🖨 اطبع {picked.reduce((a, i) => a + sel[i.id], 0)} ملصق</button>
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
      <div id="lbl">
        {picked.flatMap((i) => Array.from({ length: sel[i.id] }, (_, k) => (
          <div key={`${i.id}-${k}`} className={`lb ${kind}`}>
            <div className="n">{i.name}{kind === "shelf" && i.size ? ` — ${i.size}` : ""}</div>
            <div className="p">{money(i.price)} ج{i.unit === "كجم" ? " / كجم" : ""}</div>
            {i.code && <div dangerouslySetInnerHTML={{ __html: barcodeSvg(i.code, 40, 1.4) }} />}
            {i.code && <div className="c">{i.code}</div>}
          </div>
        )))}
      </div>
    </>
  );
}
