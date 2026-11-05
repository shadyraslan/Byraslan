"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScanInput from "@/components/ScanInput";
import { boxSn, crateId } from "@/lib/scan";
import { crateOpen, loadBox, unloadBox, tripDepart, tripState, type CrateState } from "../actions";

type Loc = { id: string; name: string };

export default function Loading({ trip, branches, initial }: { trip: number; branches: Loc[]; initial: CrateState[] }) {
  const router = useRouter();
  const [state, setState] = useState<CrateState[]>(initial);
  const [cur, setCur] = useState<{ crate: string; to: string | null } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const ln = (id: string | null) => branches.find((b) => b.id === id)?.name ?? id ?? "";
  const bad = (t: string) => { setMsg({ ok: false, t }); try { navigator.vibrate?.(200); } catch {} };
  const refresh = async () => setState(await tripState(trip));

  const onScan = (raw: string) => {
    const cr = crateId(raw);
    if (cr) {
      start(async () => {
        const r = await crateOpen(trip, cr, null);
        if (!r.ok) return bad(r.error);
        setCur({ crate: cr, to: r.to });
        setMsg({ ok: true, t: r.to ? `📦 رجعت لـ ${cr} (${ln(r.to)}) — كمّل امسح العلب` : `📦 ${cr} — اختار لأنهي فرع` });
      });
      return;
    }
    const sn = boxSn(raw);
    if (!sn) return bad(`"${raw}" مش ملصق علبة ولا صندوق`);
    if (!cur) return bad("امسح الصندوق البلاستيك الأول");
    if (!cur.to) return bad(`اختار الصندوق ${cur.crate} لأنهي فرع الأول`);
    start(async () => {
      const r = await loadBox(trip, cur.crate, sn);
      if (!r.ok) return bad(r.error);
      setMsg({ ok: true, t: `✓ #${sn} ${r.item} → ${cur.crate} (${ln(cur.to)})` });
      await refresh();
    });
  };

  const pick = (to: string) =>
    start(async () => {
      if (!cur) return;
      const r = await crateOpen(trip, cur.crate, to);
      if (!r.ok) return bad(r.error);
      setCur({ crate: cur.crate, to });
      setMsg({ ok: true, t: `📦 ${cur.crate} لفرع ${ln(to)} — امسح العلب` });
      await refresh();
    });

  const undo = () =>
    start(async () => {
      const c = state.find((x) => x.crate === cur?.crate);
      const last = c?.boxes[c.boxes.length - 1];
      if (!last) return;
      const r = await unloadBox(trip, last.sn);
      if (!r.ok) return bad(r.error);
      setMsg({ ok: true, t: `شلنا #${last.sn} من ${cur?.crate}` });
      await refresh();
    });

  const depart = () =>
    start(async () => {
      const r = await tripDepart(trip);
      if (!r.ok) return bad(r.error);
      router.push("/transfers");
    });

  const c = state.find((x) => x.crate === cur?.crate);
  const byBranch = state.reduce<Record<string, CrateState[]>>((m, x) => ((m[x.to_loc] ??= []).push(x), m), {});
  const total = state.reduce((a, x) => a + x.boxes.length, 0);

  return (
    <>
      <div className="card" style={{ border: "2px solid var(--y)" }}>
        <h2 style={{ fontSize: 17 }}>{!cur ? "1) امسح الصندوق البلاستيك" : !cur.to ? `📦 ${cur.crate} — لأنهي فرع؟` : `📦 ${cur.crate} ← ${ln(cur.to)} · ${c?.boxes.length ?? 0} علبة`}</h2>
        {cur && !cur.to && (
          <div className="row">{branches.map((b) => <button key={b.id} className="btn pri" onClick={() => pick(b.id)} disabled={pending} style={{ height: 52, minWidth: 130, fontSize: 16 }}>{b.name}</button>)}</div>
        )}
        <ScanInput onScan={onScan} placeholder={!cur ? "امسح الصندوق" : "امسح العلبة (أو صندوق تاني)"} />
        {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
        {cur?.to && (
          <div className="row">
            <button className="btn pri" onClick={() => { setMsg({ ok: true, t: `اتقفل ${cur.crate} — امسح الصندوق اللي بعده` }); setCur(null); }} style={{ height: 52, flex: "1 1 220px", fontSize: 16 }}>✓ الصندوق ده خلص — اللي بعده</button>
            {!!c?.boxes.length && <button className="btn" onClick={undo} disabled={pending} style={{ height: 52 }}>↩ شيل آخر علبة</button>}
          </div>
        )}
        <div className="muted" style={{ fontSize: 12.5 }}>الصندوق بيتحدد لفرع واحد. العلبة لازم تكون في مخزون المصنع وصلاحيتها أكتر من يوم، وأي علبة اتحمّلت قبل كده بتترفض.</div>
      </div>

      <div className="card">
        <h2>على العربية <span className="pill num">{total} علبة</span></h2>
        {Object.entries(byBranch).map(([to, L]) => (
          <div key={to}>
            <b>{ln(to)}</b>: {L.map((x) => <span key={x.crate} className="pill" style={{ marginInlineEnd: 6 }}>{x.crate} ({x.boxes.length})</span>)}
          </div>
        ))}
        {!total && <div className="muted">لسه مفيش علب</div>}
        <button className="btn pri" onClick={depart} disabled={pending || !total} style={{ height: 52, fontSize: 16 }}>🚚 العربية خرجت — ابعت التحويلات</button>
        <div className="note">لما العربية تخرج بيتعمل تحويل لكل فرع "في الطريق". الفرع بيستلم بمسح الصندوق (بيستلم كل العلب اللي جواه مرة واحدة) أو العلب واحدة واحدة.</div>
      </div>
    </>
  );
}
