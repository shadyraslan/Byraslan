"use client";
import { useState } from "react";
import { savePrice } from "./actions";

type It = { id: number; name: string; unit: string };
type Loc = { id: string; name: string };

export default function PriceGrid({ items, locs, prices, canEdit, channel }: { items: It[]; locs: Loc[]; prices: Record<string, number>; canEdit: boolean; channel: "direct" | "app" }) {
  const [st, setSt] = useState<Record<string, "ok" | "bad" | "">>({});
  const [q, setQ] = useState("");
  const save = async (it: number, loc: string, v: string) => {
    const k = `${it}|${loc}`;
    if (String(prices[k] ?? "") === v.trim()) return;
    const r = await savePrice(it, loc, v, channel);
    setSt((s) => ({ ...s, [k]: r.ok ? "ok" : "bad" }));
  };
  const L = items.filter((i) => !q || i.name.includes(q));
  return (
    <div className="card" style={{ overflowX: "auto" }}>
      <input placeholder="دوّر على صنف" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
      <table>
        <thead><tr><th>الصنف</th>{locs.map((l) => <th key={l.id} style={{ textAlign: "center" }}>{l.name}</th>)}</tr></thead>
        <tbody>
          {L.map((it) => (
            <tr key={it.id}>
              <td><b>{it.name}</b> <span className="muted" style={{ fontSize: 12 }}>ج/{it.unit}</span></td>
              {locs.map((l) => {
                const k = `${it.id}|${l.id}`;
                return (
                  <td key={l.id} style={{ textAlign: "center" }}>
                    <input defaultValue={prices[k] ?? ""} disabled={!canEdit} inputMode="decimal" dir="ltr" onBlur={(e) => save(it.id, l.id, e.target.value)}
                      style={{ width: 90, height: 34, textAlign: "center", borderColor: st[k] === "ok" ? "var(--good)" : st[k] === "bad" ? "var(--bad)" : undefined }} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="note">السعر بيتحفظ أول ما تخرج من الخانة، والإطار بيبقى أخضر لما يتحفظ. كل تغيير بيتسجّل في سجل الأسعار. {channel === "app" ? "صفحة الطلب أونلاين بتاخد السعر من هنا، والصنف اللي مالوش سعر مش بيظهر للعميل." : "الكاشير بياخد السعر من هنا"}، والشاشة مابتبعتش سعر.</div>
    </div>
  );
}
