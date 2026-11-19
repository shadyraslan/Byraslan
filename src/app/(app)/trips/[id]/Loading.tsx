"use client";
import { useEffect, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import ScanInput from "@/components/ScanInput";
import { boxSn, crateId } from "@/lib/scan";
import { crateOpen, loadBox, unloadBox, tripDepart, tripState, type CrateState } from "../actions";

type Loc = { id: string; name: string };
type LL = { loc: string; loc_name: string; item_id: number; name: string; unit: string; req: number; loaded: number; loaded_n: number; left: number; ready: number; ready_n: number };

export default function Loading({ trip, branches, initial }: { trip: number; branches: Loc[]; initial: CrateState[] }) {
  const router = useRouter();
  const [state, setState] = useState<CrateState[]>(initial);
  const [cur, setCur] = useState<{ crate: string; to: string | null } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const ln = (id: string | null) => branches.find((b) => b.id === id)?.name ?? id ?? "";
  const bad = (t: string) => { setMsg({ ok: false, t }); try { navigator.vibrate?.(200); } catch {} };
  const sb = supabaseBrowser();
  const [list, setList] = useState<LL[]>([]);
  const [shortWhy, setShortWhy] = useState("");
  const loadList = async () => { const { data } = await sb.rpc("trip_loading_list", { p_trip: trip }); setList((data ?? []) as LL[]); };
  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { setState(await tripState(trip)); loadList(); };

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

  const shortReady = list.filter((x) => x.left > 0.009 && x.ready > 0.009);
  const depart = () =>
    start(async () => {
      if (shortReady.length) {
        if (shortWhy.trim().length < 3) return bad("فيه أصناف مطلوبة وجاهزة في المصنع ومش متحمّلة — حمّلها أو اكتب السبب");
        const { error } = await sb.rpc("trip_short_note", { p_trip: trip, p_note: shortWhy });
        if (error) return bad(error.message.replace(/^.*?ERROR:\s*/, ""));
      }
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
        <h2 style={{ fontSize: 17 }}>{!cur ? "1) امسح الصندوق البلاستيك" : !cur.to ? `📦 ${cur.crate} — لأنهي فرع؟` : `${cur.crate.startsWith("NC-") ? "من غير صندوق" : `📦 ${cur.crate}`} ← ${ln(cur.to)} · ${c?.boxes.length ?? 0} علبة`}</h2>
        {cur && !cur.to && (
          <div className="row">{branches.map((b) => <button key={b.id} className="btn pri" onClick={() => pick(b.id)} disabled={pending} style={{ height: 52, minWidth: 130, fontSize: 16 }}>{b.name}</button>)}</div>
        )}
        {!cur && (
          <div className="row" style={{ gap: 6 }}>
            <span className="muted">أو من غير صندوق:</span>
            {branches.filter((b) => b.id !== "factory").map((b) => <button key={b.id} className="btn" disabled={pending} onClick={() => start(async () => {
              const id = `NC-${b.id}`;
              const r = await crateOpen(trip, id, b.id);
              if (!r.ok) return bad(r.error);
              setCur({ crate: id, to: b.id });
              setMsg({ ok: true, t: `${b.name} من غير صندوق — امسح العلب أو اكتب أرقامها` });
              await refresh();
            })}>{b.name}</button>)}
          </div>
        )}
        <ScanInput onScan={onScan} placeholder={!cur ? "امسح الصندوق" : "امسح العلبة أو اكتب رقمها (أو صندوق تاني)"} />
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
        <h2>قايمة التحميل (طلبات الفروع)</h2>
        {!list.length && <div className="muted">مفيش طلبات فروع عليها الدور — حمّل حسب التحويل اليدوي.</div>}
        {Object.entries(list.reduce<Record<string, LL[]>>((m, x) => ((m[x.loc_name] ??= []).push(x), m), {})).map(([b, L]) => (
          <div key={b} style={{ marginBottom: 8 }}>
            <b>{b}</b>
            <table><tbody>{L.map((x) => (
              <tr key={x.item_id} style={{ background: x.left > 0.009 && x.ready > 0.009 ? "color-mix(in srgb, var(--bad) 8%, transparent)" : undefined }}>
                <td>{x.name}</td>
                <td className="num">مطلوب {x.req} {x.unit}</td>
                <td className="num" style={{ color: x.left <= 0.009 ? "var(--good)" : undefined }}>اتحمّل {x.loaded} ({x.loaded_n} علبة){x.left <= 0.009 ? " ✓" : ""}</td>
                <td className="num">{x.left > 0.009 ? (x.ready > 0.009 ? <b style={{ color: "var(--bad)" }}>فاضل {x.left} — جاهز في المصنع {x.ready} ({x.ready_n} علبة)</b> : <span className="muted">فاضل {x.left} — مش جاهز في المصنع</span>) : ""}</td>
              </tr>))}</tbody></table>
          </div>
        ))}
        {shortReady.length > 0 && <input value={shortWhy} onChange={(e) => setShortWhy(e.target.value)} placeholder="سبب إن فيه حاجة جاهزة مش هتتحمّل (إجباري قبل الخروج)" />}
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
