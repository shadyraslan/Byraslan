"use client";
import { useState, useTransition } from "react";
import { setPoQty } from "./actions";

/** كمية سطر في أمر لسه ماتستلمش: تتعدل (0 = يتشال من الأمر) */
export default function PoQty({ po, line, qty }: { po: number; line: number; qty: number }) {
  const [v, setV] = useState(String(qty));
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const save = () => {
    const n = Number(v);
    if (!Number.isFinite(n) || n === qty) return;
    start(async () => { const r = await setPoQty(po, line, n); setErr(r.ok ? "" : r.error); });
  };
  return (
    <span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} inputMode="decimal" dir="ltr" disabled={pending} style={{ width: 70, height: 28, padding: "0 6px" }} />
      <button className="btn" title="شيل الصنف من الأمر" disabled={pending} style={{ height: 28, padding: "0 8px", marginInlineStart: 4 }} onClick={() => start(async () => { const r = await setPoQty(po, line, 0); setErr(r.ok ? "" : r.error); })}>✕</button>
      {err && <span className="badmsg" style={{ fontSize: 12 }}>{err}</span>}
    </span>
  );
}
