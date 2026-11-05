"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPo, type PoLine } from "./actions";

type It = { id: number; name: string; unit: string; prices: Record<number, number> };

export default function NewPo({ suppliers, items }: { suppliers: { id: number; name: string }[]; items: It[] }) {
  const router = useRouter();
  const [sup, setSup] = useState(0);
  const [exp, setExp] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<PoLine[]>([{ item_id: 0, qty: 0, price: 0 }]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, p: Partial<PoLine>) => setLines((L) => L.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const total = lines.reduce((a, l) => a + l.qty * l.price, 0);
  return (
    <div className="card">
      <h2>أمر توريد جديد</h2>
      <div className="row">
        <label className="fld">المورد<select value={sup} onChange={(e) => setSup(Number(e.target.value))}><option value={0}>—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="fld">ميعاد الوصول<input type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></label>
        <label className="fld" style={{ flex: "1 1 200px" }}>ملاحظة<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="row">
          <select value={l.item_id} onChange={(e) => { const id = Number(e.target.value); set(i, { item_id: id, price: items.find((x) => x.id === id)?.prices[sup] ?? l.price }); }} style={{ flex: "1 1 220px" }}>
            <option value={0}>— الصنف —</option>{items.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
          </select>
          <input value={l.qty || ""} onChange={(e) => set(i, { qty: Number(e.target.value) || 0 })} placeholder="الكمية" inputMode="decimal" dir="ltr" style={{ width: 100 }} />
          <input value={l.price || ""} onChange={(e) => set(i, { price: Number(e.target.value) || 0 })} placeholder="السعر" inputMode="decimal" dir="ltr" style={{ width: 100 }} />
          <button className="btn" onClick={() => setLines((L) => L.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn" onClick={() => setLines((L) => [...L, { item_id: 0, qty: 0, price: 0 }])}>+ صنف</button>
        <b className="num">الإجمالي {total.toLocaleString("en-US")} ج</b>
      </div>
      <button className="btn pri" disabled={pending} onClick={() => start(async () => {
        const r = await createPo(sup, exp, note, lines);
        if (!r.ok) return setMsg({ ok: false, t: r.error });
        setMsg({ ok: true, t: "اتعمل أمر التوريد" }); setLines([{ item_id: 0, qty: 0, price: 0 }]); router.refresh();
      })}>اعمل أمر التوريد</button>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}
