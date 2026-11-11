"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import ScanInput from "@/components/ScanInput";

type Line = { line: number; item_id: number; name: string; unit: string; qty: number; prepared: number | null; barcodes: string[] | null };
type O = { id: number; no: number; status: string; at: string; customer: string | null; near: boolean; prep: { receipt_no: string | null; amount: number | null; bags: number | null; status: string } | null; lines: Line[] };
function beep() { try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.3); setTimeout(() => c.close(), 600); } catch {} }

/** ديسباتشر الماركت: طلبات فيها أصناف شريك ← امسح أو "اتجاب" / "مش موجود" ← رقم إيصال الكاشير والمبلغ والشنط ← جاهز للكابتن */
export default function Dispatch({ locs, home }: { locs: { id: string; name: string }[]; home: string | null }) {
  const sb = supabaseBrowser();
  const [loc, setLoc] = useState(locs.find((l) => l.id === home)?.id ?? locs[0]?.id ?? "");
  const [L, setL] = useState<O[]>([]);
  const [cur, setCur] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [f, setF] = useState({ receipt: "", amount: "", bags: "1" });
  const seen = useRef(new Set<number>());
  const load = useCallback(async () => {
    if (!loc) return;
    const { data, error } = await sb.rpc("partner_queue", { p_loc: loc });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    const n = (data ?? []) as O[];
    if (seen.current.size && n.some((o) => !seen.current.has(o.id))) beep();
    n.forEach((o) => seen.current.add(o.id));
    setL(n);
  }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seen.current = new Set(); load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  const o = L.find((x) => x.id === cur) ?? null;
  const pick = async (order: number, line: number, qty: number) => {
    const { error } = await sb.rpc("partner_pick", { p_order: order, p_line: line, p_qty: qty });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    load();
  };
  const onScan = (raw: string) => {
    if (!o) return setMsg({ ok: false, t: "افتح طلب الأول" });
    const l = o.lines.find((x) => (x.barcodes ?? []).includes(raw.trim()) && x.prepared == null);
    if (!l) return setMsg({ ok: false, t: `"${raw}" مش في الطلب ده (أو اتحضّر)` });
    setMsg({ ok: true, t: `✓ ${l.name}` });
    pick(o.id, l.line, l.unit === "قطعة" ? l.qty : l.qty);
  };
  const ready = async () => {
    if (!o) return;
    const { error } = await sb.rpc("partner_ready", { p_order: o.id, p_receipt: f.receipt, p_amount: Number(f.amount), p_bags: Number(f.bags) || 1 });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    setMsg({ ok: true, t: `طلب ${o.no} جاهز للكابتن ✅` }); setF({ receipt: "", amount: "", bags: "1" }); setCur(null); load();
  };
  const col = (s: string) => L.filter((x) => (s === "new" ? !x.prep : s === "prep" ? x.prep?.status === "preparing" : x.prep?.status === "ready"));
  return (
    <>
      <div className="top"><h1>ديسباتشر الماركت</h1>
        {locs.length > 1 && <select value={loc} onChange={(e) => setLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      {!o ? (
        <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {([["new", "جديد"], ["prep", "جاري التحضير"], ["ready", "جاهز للاستلام"]] as const).map(([k, t]) => (
            <div key={k} className="card"><h2 style={{ marginTop: 0 }}>{t} ({col(k).length})</h2>
              {col(k).map((x) => (
                <button key={x.id} className="btn" style={{ width: "100%", height: "auto", padding: 10, marginBottom: 6, textAlign: "start", display: "block" }} onClick={() => setCur(x.id)}>
                  <b>#{x.no}</b> · {x.lines.length} صنف · {x.customer ?? ""}<div className="muted" style={{ fontSize: 12 }}>{x.near ? "كابتن واحد بيعدّي" : "بعيد — مدير الحركة بيقرر"}{x.prep?.receipt_no ? ` · إيصال ${x.prep.receipt_no}` : ""}</div>
                </button>
              ))}
              {!col(k).length && <div className="muted">مفيش</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>طلب #{o.no}</b><button className="btn" onClick={() => setCur(null)}>→ الطلبات</button></div>
          <ScanInput onScan={onScan} placeholder="امسح باركود الصنف…" />
          <table><tbody>{o.lines.map((l) => (
            <tr key={l.line} style={{ background: l.prepared == null ? undefined : l.prepared > 0 ? "#F0FAF3" : "#FDECEC" }}>
              <td><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{l.qty} {l.unit}</div></td>
              <td className="row" style={{ gap: 4 }}>
                {l.unit !== "قطعة" && <input inputMode="decimal" placeholder="الوزن" defaultValue={l.prepared ?? ""} style={{ width: 80 }} onBlur={(e) => { if (e.target.value) pick(o.id, l.line, Number(e.target.value)); }} />}
                <button className="btn pri" onClick={() => pick(o.id, l.line, l.qty)}>اتجاب</button>
                <button className="btn" onClick={() => pick(o.id, l.line, 0)}>مش موجود</button>
              </td>
            </tr>
          ))}</tbody></table>
          <div className="row" style={{ alignItems: "end" }}>
            <label className="fld">رقم إيصال كاشير الماركت<input value={f.receipt} onChange={(e) => setF({ ...f, receipt: e.target.value })} dir="ltr" /></label>
            <label className="fld">المبلغ<input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" dir="ltr" style={{ width: 100 }} /></label>
            <label className="fld">الشنط<input value={f.bags} onChange={(e) => setF({ ...f, bags: e.target.value })} inputMode="numeric" style={{ width: 60 }} /></label>
            <button className="btn pri" onClick={ready}>جاهز للكابتن</button>
          </div>
        </div>
      )}
    </>
  );
}
