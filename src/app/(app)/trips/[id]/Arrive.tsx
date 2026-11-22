"use client";
import { useState, useTransition } from "react";
import { arriveTrip, addStop } from "../actions";

/** الفرع بيأكد إن الرحلة وصلت — زرار واحد بيدخّل كل اللي على العربية للفرع ده رصيده */
export function ArriveButton({ trip, loc, name, boxes }: { trip: number; loc: string; name: string; boxes: number }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) return <div className="okmsg">✓ {msg.t}</div>;
  return (
    <span className="row" style={{ gap: 6, alignItems: "center" }}>
      <button className="btn pri" disabled={pending} style={{ height: 40 }} onClick={() => start(async () => {
        const r = await arriveTrip(trip, loc);
        setMsg(r.ok ? { ok: true, t: `وصلت ${name} — دخل ${r.n} طبق الرصيد` } : { ok: false, t: r.error });
      })}>{pending ? "…" : `✓ الرحلة وصلت ${name}`}</button>
      <span className="muted num">{boxes} طبق</span>
      {msg && !msg.ok && <span className="badmsg">{msg.t}</span>}
    </span>
  );
}

/** نزوّد فرع للرحلة وهي بتتحمّل */
export function AddStop({ trip, options }: { trip: number; options: { id: string; name: string }[] }) {
  const [v, setV] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  if (!options.length) return null;
  return (
    <span className="row" style={{ gap: 6 }}>
      <select value={v} onChange={(e) => setV(e.target.value)} style={{ height: 36 }}><option value="">+ فرع للرحلة</option>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
      <button className="btn" disabled={!v || pending} style={{ height: 36 }} onClick={() => start(async () => { const r = await addStop(trip, v); if (!r.ok) setErr(r.error); else { setErr(""); setV(""); location.reload(); } })}>زوّد</button>
      {err && <span className="badmsg">{err}</span>}
    </span>
  );
}
