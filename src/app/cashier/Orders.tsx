"use client";
import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import ScanInput from "@/components/ScanInput";
import OrderClose from "@/components/OrderClose";

/* طلبات الأونلاين جوه الكاشير: بتتحدّث كل 10 ثواني، والطلب الجديد بيرن لحد ما حد يفتحه */

export type OOrder = {
  id: number; no: number; status: string; created_at: string; pay: string; address: string | null; note: string | null; fee: number; discount: number; est: number; driver: string | null; rider_id?: number | null; rider_note?: string | null; fee_orig?: number | null; branch_discount?: number; branch_discount_note?: string | null; floor?: string | null; apt?: string | null; landmark?: string | null; booking?: boolean; scheduled_for?: string | null; slot?: string | null; deposit?: number; deposit_paid?: boolean; lat?: number | null; lng?: number | null; pin_far?: boolean; pin_km?: number | null;
  customer: string; phone: string; lines: { line: number; name: string; unit: string; qty: number; prepared: number; price: number }[]; boxes: number[];
};
const ST: Record<string, string> = { new: "جديد", accepted: "اتقبل", preparing: "بيتحضّر", ready: "جاهز", out: "مع الطيار" };
const PAY: Record<string, string> = { cash: "كاش", card: "فيزا", instapay: "إنستاباي", wallet: "محفظة", credit: "آجل" };
const msgOf = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");

// صوت تنبيه من غير ملفات
function beep() {
  try {
    const A = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const c = new A();
    [0, 0.25, 0.5].forEach((t) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; o.connect(g); g.connect(c.destination); g.gain.setValueAtTime(0.25, c.currentTime + t); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.15); });
    setTimeout(() => c.close(), 1200);
  } catch {}
}

export function useOrders(sb: SupabaseClient, loc: string | undefined, enabled: boolean, online: boolean) {
  const [orders, setOrders] = useState<OOrder[]>([]);
  const [fresh, setFresh] = useState<number[]>([]);
  const seen = useRef<Set<number> | null>(null);
  const load = async () => {
    if (!loc || !enabled || !navigator.onLine) return;
    const { data } = await sb.rpc("pos_orders", { p_loc: loc });
    const L = ((data ?? []) as OOrder[]).map((o) => ({ ...o, fee: Number(o.fee), discount: Number(o.discount), est: Number(o.est), lines: (o.lines ?? []).map((l) => ({ ...l, qty: Number(l.qty), prepared: Number(l.prepared), price: Number(l.price) })) }));
    setOrders(L);
    const news = L.filter((o) => o.status === "new").map((o) => o.id);
    if (seen.current) {
      const add = news.filter((id) => !seen.current!.has(id));
      if (add.length) setFresh((f) => [...new Set([...f, ...add])]);
    }
    seen.current = new Set(L.map((o) => o.id));
  };
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [loc, enabled, online]); // eslint-disable-line react-hooks/exhaustive-deps
  // الرنة بتتكرر كل 4 ثواني لحد ما حد يفتح الطلب
  useEffect(() => { if (!fresh.length) return; beep(); const t = setInterval(beep, 4000); return () => clearInterval(t); }, [fresh.length]);
  return { orders, fresh, ack: (id: number) => setFresh((f) => f.filter((x) => x !== id)), load };
}

type RC = { id: number; rider_id: number; amount: number; at: string; order_id: number; riders: { name: string } | null };

// كاش الطيارين اللي لسه ماتسلّمش — الكاشير بيستلمه في ورديته
function RiderCash({ sb, loc, shiftClient }: { sb: SupabaseClient; loc: string; shiftClient: string | null }) {
  const [rows, setRows] = useState<RC[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const load = async () => { const { data } = await sb.from("rider_cash").select("id,rider_id,amount,at,order_id,riders(name)").eq("location_id", loc).is("settled_at", null).order("at"); setRows((data ?? []) as unknown as RC[]); };
  useEffect(() => { if (loc) load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps
  const by = new Map<number, { name: string; total: number; n: number }>();
  rows.forEach((r) => { const x = by.get(r.rider_id) ?? { name: r.riders?.name ?? "", total: 0, n: 0 }; x.total += Number(r.amount); x.n++; by.set(r.rider_id, x); });
  if (!by.size) return null;
  return (
    <div className="card" style={{ display: "grid", gap: 6, marginBottom: 10 }}>
      <b>💵 كاش مع الطيارين</b>
      {[...by.entries()].map(([id, x]) => (
        <div key={id} className="row" style={{ justifyContent: "space-between" }}>
          <span>{x.name} · {x.n} طلب</span>
          <span className="row" style={{ gap: 6 }}><b className="num">{Math.round(x.total * 100) / 100} ج</b>
            <button className="btn pri" style={{ height: 30 }} disabled={!shiftClient} onClick={async () => {
              const { data, error } = await sb.rpc("rider_settle", { p_rider: id, p_ids: rows.filter((r) => r.rider_id === id).map((r) => r.id), p_shift_client: shiftClient });
              setMsg(error ? { ok: false, t: msgOf(error) } : { ok: true, t: `استلمت ${data} ج من ${x.name} — اتحسبوا في كاش ورديتك` }); load();
            }}>استلمت</button></span>
        </div>
      ))}
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}

export default function OrdersPanel({ sb, orders, ack, reload, online, loc, shiftClient }: { sb: SupabaseClient; orders: OOrder[]; ack: (id: number) => void; reload: () => void; online: boolean; loc: string; shiftClient: string | null }) {
  const [cur, setCur] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const o = orders.find((x) => x.id === cur) ?? null;
  const run = async (p: PromiseLike<{ error: { message?: string } | null }>, ok: string) => { const { error } = await p; setMsg(error ? { ok: false, t: msgOf(error) } : { ok: true, t: ok }); reload(); };
  const mins = (s: string) => Math.round((Date.now() - new Date(s).getTime()) / 60000);

  if (!online) return <div className="card" style={{ margin: "0 16px" }}><b>مفيش نت — طلبات الأونلاين مش بتوصل للجهاز دلوقتي.</b><div className="muted">لو النت فضل قاطع أكتر من المدة اللي في الإعدادات، الطلبات الجديدة بتتحوّل لوحدها للفرع الاحتياطي.</div></div>;

  return (
    <div className="noprint" style={{ display: "grid", gridTemplateColumns: "minmax(260px, 340px) 1fr", gap: 12, padding: "0 16px 16px" }}>
      <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
        {orders.map((x) => (
          <button key={x.id} onClick={() => { setCur(x.id); ack(x.id); setMsg(null); }} className="card" style={{ textAlign: "right", cursor: "pointer", border: x.id === cur ? "2px solid var(--y)" : x.status === "new" ? "2px solid var(--bad)" : undefined, display: "grid", gap: 2 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b className="num">#{x.no}</b><span style={{ color: x.status === "new" ? "var(--bad)" : undefined, fontWeight: 700 }}>{ST[x.status]}{x.status === "out" && x.driver ? ` · ${x.driver}` : ""} · <span className="num">{mins(x.created_at)} د</span></span></div>
            <div>{x.customer} <span className="muted">· {x.lines.length} صنف · {PAY[x.pay]}</span></div>
            {x.booking && x.scheduled_for && <div style={{ color: "#7A6200", fontWeight: 700 }}>📅 حجز الساعة {x.slot} — {new Date(x.scheduled_for).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Cairo" })}</div>}
          </button>
        ))}
        {!orders.length && <div className="card muted">مفيش طلبات أونلاين مفتوحة</div>}
      </div>
      <div>
        <RiderCash sb={sb} loc={loc} shiftClient={shiftClient} />
        {!o ? <div className="card muted">اختار طلب</div> : (
          <div className="card" style={{ display: "grid", gap: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>طلب #{o.no} — {ST[o.status]}</h2><span className="num">{o.phone}</span></div>
            <div><b>{o.customer}</b> — {o.address}{o.floor ? ` · الدور ${o.floor}` : ""}{o.apt ? ` · شقة ${o.apt}` : ""}{o.landmark ? ` · ${o.landmark}` : ""}{o.lat != null && <> · <a href={`https://maps.google.com/?q=${o.lat},${o.lng}`} target="_blank" rel="noreferrer">📍 الخريطة</a></>}{o.pin_far && <b style={{ color: "var(--bad)" }}> · ⚠️ بعيد {o.pin_km} كم</b>}</div>
            {o.note && <div style={{ color: "var(--bad)", fontWeight: 700 }}>ملاحظة: {o.note}</div>}
            {["accepted", "preparing"].includes(o.status) && (
              <ScanInput placeholder="امسح العلب أو الأصناف للطلب ده" onScan={(c) => run(sb.rpc("order_scan", { p_id: o.id, p_code: c, p_qty: null }), "✓ اتضاف للطلب")} />
            )}
            <table>
              <thead><tr><th>الصنف</th><th>المطلوب</th><th>المتحضّر</th><th>القيمة</th></tr></thead>
              <tbody>{o.lines.map((l) => <tr key={l.line}><td><b>{l.name}</b></td><td className="num">{l.qty} {l.unit}</td><td className="num" style={{ color: l.prepared <= 0 ? "var(--bad)" : "var(--good)", fontWeight: 700 }}>{l.prepared}</td><td className="num">{Math.round((l.prepared || l.qty) * l.price)}</td></tr>)}</tbody>
            </table>
            {!!o.boxes.length && <div className="row" style={{ gap: 6 }}>{o.boxes.map((sn) => <button key={sn} className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => run(sb.rpc("order_unscan", { p_id: o.id, p_sn: sn }), `شلت العلبة #${sn}`)}>#{sn} ✕</button>)}</div>}
            <div className="muted">التوصيل {o.fee} {o.discount > 0 ? `· خصم ${o.discount}` : ""} · الدفع {PAY[o.pay]}{o.booking ? ` · حجز الساعة ${o.slot}${o.deposit ? ` · عربون ${o.deposit} ج ${o.deposit_paid ? "✓ مدفوع" : "(مش مدفوع)"}` : ""}` : ""}</div>
            <div className="row">
              {o.status === "new" && <button className="btn pri" onClick={() => run(sb.rpc("order_status", { p_id: o.id, p_status: "accepted" }), "اتقبل — امسح العلب")}>اقبل الطلب</button>}
              {["accepted", "preparing"].includes(o.status) && <button className="btn pri" onClick={() => run(sb.rpc("order_status", { p_id: o.id, p_status: "ready" }), "جاهز")}>جاهز للتوصيل</button>}
              {["ready", "out"].includes(o.status) && <a className="btn" href={`/print/order/${o.id}`} target="_blank" rel="noreferrer" style={{ display: "inline-grid", placeItems: "center" }}>🖨️ اطبع الفاتورة</a>}
              {o.driver && o.status === "out" && <span className="muted">مع الطيار: <b>{o.driver}</b></span>}
            </div>
            <OrderClose key={o.id + o.status} o={{ id: o.id, status: o.status, pay_method: o.pay, loc, sub: o.lines.reduce((a, l) => a + (l.prepared || 0) * l.price, 0), fee: o.fee, fee_orig: o.fee_orig ?? null, discount: o.discount, branch_discount: Number(o.branch_discount ?? 0), branch_discount_note: o.branch_discount_note ?? null, rider_note: o.rider_note ?? null, rider_id: o.rider_id ?? null }} onDone={(t) => { setMsg({ ok: true, t }); reload(); }} />
            {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
