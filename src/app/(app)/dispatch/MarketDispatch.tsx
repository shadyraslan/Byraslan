"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import ScanInput from "@/components/ScanInput";

type Line = { line: number; item_id: number; name: string; unit: string; sold_by: string; qty: number; picked: number | null; recv: boolean; note: string | null; barcodes: string[] | null };
type O = { id: number; no: number; status: string; at: string; customer: string; slot: string | null; note: string | null; lines: Line[] };
const ST: Record<string, string> = { new: "جديد (الكاشير لسه ماقبلوش)", accepted: "اتقبل", preparing: "بيتحضّر" };
const msgOf = (e: { message?: string }) => (e.message ?? "").replace(/^.*?ERROR:\s*/, "");
function beep() { try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.3); setTimeout(() => c.close(), 600); } catch {} }

/** ديسباتشر ماركت رسلان: لكل طلب في الفرع، أصناف السوبر ماركت اللي محتاجة تتجهّز — امسح الباركود أو اكتب الكمية، والكاشير بيستلمها بزرار */
export default function MarketDispatch({ locs, home }: { locs: { id: string; name: string }[]; home: string | null }) {
  const sb = supabaseBrowser();
  const [loc, setLoc] = useState(locs.find((l) => l.id === home)?.id ?? locs[0]?.id ?? "");
  const [L, setL] = useState<O[]>([]);
  const [cur, setCur] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const seen = useRef(new Set<number>());
  const load = useCallback(async () => {
    if (!loc) return;
    const { data, error } = await sb.rpc("market_queue", { p_loc: loc });
    if (error) return setMsg({ ok: false, t: msgOf(error) });
    const n = (data ?? []) as O[];
    if (seen.current.size && n.some((o) => !seen.current.has(o.id))) beep();
    n.forEach((o) => seen.current.add(o.id));
    setL(n);
  }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seen.current = new Set(); load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [load]);
  const o = L.find((x) => x.id === cur) ?? null;
  const done = (x: O) => x.lines.every((l) => l.recv || (l.picked ?? 0) > 0);
  const pick = async (line: Line, q: number) => {
    if (!o) return;
    const { data, error } = await sb.rpc("market_pick", { p_order: o.id, p_line: line.line, p_qty: q });
    setMsg(error ? { ok: false, t: msgOf(error) } : { ok: !String(data).includes("⚠️"), t: String(data) });
    load();
  };
  const onScan = async (raw: string) => {
    if (!o) return setMsg({ ok: false, t: "افتح طلب الأول" });
    const { data, error } = await sb.rpc("market_scan", { p_order: o.id, p_code: raw });
    setMsg(error ? { ok: false, t: msgOf(error) } : { ok: !String(data).includes("⚠️"), t: String(data) });
    load();
  };
  return (
    <>
      <div className="top"><h1>ديسباتشر السوبر ماركت بتاعنا</h1>
        {locs.length > 1 && <select value={loc} onChange={(e) => { setLoc(e.target.value); setCur(null); }} style={{ height: 40 }}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
      </div>
      <div className="note" style={{ marginBottom: 12 }}>هنا أصناف السوبر ماركت بس في طلبات الفرع. جهّز كل طلب (امسح باركود الصنف أو اكتب الكمية)، والكاشير هيلاقيها عنده «اتجهّزت» ويدوس «استلمها». منتجات روستوز بتتجهّز بالعلب عند الكاشير زي ما هي.</div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 320px) 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          {L.map((x) => (
            <button key={x.id} onClick={() => { setCur(x.id); setMsg(null); }} className="card" style={{ textAlign: "right", cursor: "pointer", border: x.id === cur ? "2px solid var(--y)" : undefined, display: "grid", gap: 2, margin: 0 }}>
              <div className="row" style={{ justifyContent: "space-between" }}><b className="num">#{x.no}</b><span className="pill" style={done(x) ? { color: "var(--good)" } : undefined}>{done(x) ? "✓ متجهّز" : `${x.lines.filter((l) => !l.recv && !(l.picked ?? 0)).length} صنف فاضل`}</span></div>
              <div>{x.customer} <span className="muted">· {ST[x.status] ?? x.status}</span></div>
              {x.slot && <div className="muted" style={{ fontSize: 12 }}>📅 حجز الساعة {x.slot}</div>}
            </button>))}
          {!L.length && <div className="card muted">مفيش طلبات فيها أصناف سوبر ماركت</div>}
        </div>
        <div>
          {!o ? <div className="card muted">اختار طلب</div> : (
            <div className="card" style={{ display: "grid", gap: 10 }}>
              <h2 style={{ margin: 0 }}>طلب #{o.no} — {o.customer}</h2>
              {o.note && <div style={{ color: "var(--bad)", fontWeight: 700 }}>ملاحظة: {o.note}</div>}
              <ScanInput placeholder="امسح باركود الصنف" onScan={onScan} />
              <table>
                <thead><tr><th>الصنف</th><th>المطلوب</th><th>اتجهّز</th><th></th></tr></thead>
                <tbody>{o.lines.map((l) => {
                  const k = `${o.id}:${l.line}`, p = l.picked ?? 0;
                  const off = p > 0 && Math.abs(p - l.qty) / l.qty > 0.1;
                  return (
                    <tr key={l.line}>
                      <td><b>{l.name}</b>{l.note && <div style={{ color: "var(--bad)", fontSize: 13 }}>{l.note}</div>}</td>
                      <td className="num">{l.qty} {l.unit}</td>
                      <td className="num" style={{ fontWeight: 700, color: l.recv ? "var(--good)" : off ? "#b7791f" : p > 0 ? "var(--good)" : "var(--bad)" }}>{l.recv ? `✓ الكاشير استلم ${p}` : p || "—"}{off && !l.recv ? " ⚠️" : ""}</td>
                      <td>{!l.recv && (
                        <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                          <button className="btn pri" style={{ height: 32 }} onClick={() => pick(l, l.qty)}>✓ كله</button>
                          <input value={qty[k] ?? ""} onChange={(e) => setQty((s) => ({ ...s, [k]: e.target.value }))} placeholder="كمية" inputMode="decimal" dir="ltr" style={{ width: 70, height: 32 }} />
                          <button className="btn" style={{ height: 32 }} disabled={!qty[k]} onClick={() => { pick(l, Number(qty[k])); setQty((s) => ({ ...s, [k]: "" })); }}>سجّل</button>
                          {p > 0 && <button className="btn" style={{ height: 32 }} onClick={() => pick(l, 0)}>↩</button>}
                        </span>)}</td>
                    </tr>);
                })}</tbody>
              </table>
              {done(o) && <div className="okmsg">الطلب ده متجهّز — سلّم الشنطة للكاشير</div>}
            </div>
          )}
          {msg && <div className={msg.ok ? "okmsg" : "badmsg"} style={{ marginTop: 8 }}>{msg.t}</div>}
        </div>
      </div>
    </>
  );
}
