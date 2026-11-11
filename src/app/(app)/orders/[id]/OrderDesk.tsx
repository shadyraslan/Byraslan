"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScanInput from "@/components/ScanInput";
import { setStatus, scanToOrder, unscan, deliver } from "../actions";

type O = {
  id: number; no: number; status: string; address: string | null; note: string | null; pay_method: string; est_total: number; total: number | null; delivery_fee: number; discount: number; promo_code: string | null; driver: string | null; cancel_reason: string | null; created_at: string; channel: string;
  customers: { name: string; phone: string; area: string | null } | null; locations: { name: string } | null;
  online_order_lines: { line: number; qty: number; unit_price: number; prepared: number; items: { name: string; unit: string } | null }[];
  online_order_boxes: { box_sn: number; line: number; qty: number }[];
};
const ST: Record<string, string> = { new: "جديد", accepted: "اتقبل", preparing: "بيتحضّر", ready: "جاهز", out: "مع الطيار", delivered: "اتسلّم", cancelled: "اتلغى" };
const PAY: Record<string, string> = { cash: "كاش", card: "فيزا", instapay: "إنستاباي", credit: "آجل" };

export default function OrderDesk({ o, canCancel }: { o: O; canCancel: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [driver, setDriver] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const run = (p: Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => start(async () => { const r = await p; setMsg(r.ok ? { ok: true, t: ok } : { ok: false, t: (r as { error: string }).error }); router.refresh(); });
  const sub = o.online_order_lines.reduce((a, l) => a + l.prepared * l.unit_price, 0);
  const prep = ["accepted", "preparing"].includes(o.status);
  return (
    <>
      <div className="top noprint"><h1>طلب #{o.no} — {ST[o.status]}</h1></div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><b>{o.customers?.name}</b> · <a href={`tel:${o.customers?.phone}`} className="num">{o.customers?.phone}</a>{" "}
            <a className="btn noprint" style={{ height: 30, display: "inline-grid", placeItems: "center" }} target="_blank" href={`https://wa.me/2${o.customers?.phone}`}>واتساب</a></div>
          <span className="muted">فرع {o.locations?.name} · {PAY[o.pay_method]}{o.channel !== "web" ? ` · ${o.channel === "phone" ? "تليفون" : "واتساب"}` : ""}</span>
        </div>
        <div>{o.customers?.area} — {o.address}</div>
        {o.note && <div style={{ color: "var(--bad)", fontWeight: 700 }}>ملاحظة: {o.note}</div>}
        {o.driver && <div>الطيار: {o.driver}</div>}
        {o.cancel_reason && <div className="badmsg">اتلغى: {o.cancel_reason}</div>}
      </div>

      {prep && <div className="card noprint" style={{ border: "2px solid var(--y)" }}><h2>امسح العلب</h2><ScanInput placeholder="امسح QR العلبة أو باركود الصنف" onScan={(c) => start(async () => { const r = await scanToOrder(o.id, c); setMsg(r.ok ? { ok: true, t: `✓ ${r.msg}` } : { ok: false, t: r.error }); router.refresh(); })} /></div>}

      <div className="card">
        <table>
          <thead><tr><th>الصنف</th><th>المطلوب</th><th>المتحضّر</th><th>السعر</th><th>القيمة</th></tr></thead>
          <tbody>{o.online_order_lines.map((l) => {
            const boxes = o.online_order_boxes.filter((b) => b.line === l.line);
            const st = l.prepared <= 0 ? "var(--bad)" : Math.abs(l.prepared - l.qty) / l.qty > 0.2 ? "#b7791f" : "var(--good)";
            return (
              <tr key={l.line}><td><b>{l.items?.name}</b>
                <div className="row noprint" style={{ gap: 4 }}>{boxes.map((b) => <button key={b.box_sn} className="btn" style={{ height: 26, fontSize: 12 }} disabled={!prep && o.status !== "ready"} onClick={() => run(unscan(o.id, b.box_sn), `شلت العلبة #${b.box_sn}`)} title="شيل العلبة">#{b.box_sn} · {b.qty} ✕</button>)}</div></td>
                <td className="num">{l.qty} {l.items?.unit}</td><td className="num" style={{ color: st, fontWeight: 700 }}>{l.prepared}</td><td className="num">{l.unit_price}</td><td className="num">{Math.round(l.prepared * l.unit_price)}</td></tr>
            );
          })}</tbody>
        </table>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}><span>التوصيل <b className="num">{o.delivery_fee}</b>{Number(o.discount) > 0 && <> · خصم <b className="num">{o.discount}</b>{o.promo_code ? ` (${o.promo_code})` : ""}</>}</span>
          <b className="num" style={{ fontSize: 20 }}>{o.total != null ? `الإجمالي ${Math.round(o.total)}` : `الإجمالي بالوزن الفعلي ${Math.round(sub + Number(o.delivery_fee) - Number(o.discount || 0))}`} ج</b></div>
        <div className="muted num" style={{ fontSize: 12.5 }}>تقدير العميل: {Math.round(Number(o.est_total) + Number(o.delivery_fee) - Number(o.discount || 0))} ج</div>
      </div>

      <div className="card row noprint">
        {o.status === "new" && <button className="btn pri" disabled={pending} onClick={() => run(setStatus(o.id, "accepted"), "اتقبل — ابدأ امسح العلب")}>اقبل الطلب</button>}
        {prep && <button className="btn pri" disabled={pending} onClick={() => run(setStatus(o.id, "ready"), "جاهز")}>جاهز للتوصيل</button>}
        {o.status === "ready" && <><input placeholder="اسم الطيار" value={driver} onChange={(e) => setDriver(e.target.value)} /><button className="btn pri" disabled={pending} onClick={() => run(setStatus(o.id, "out", driver), "خرج مع الطيار")}>خرج</button></>}
        {o.status === "out" && <button className="btn pri" disabled={pending} onClick={() => start(async () => { const r = await deliver(o.id); setMsg(r.ok ? { ok: true, t: `اتسلّم واتحصّل ${Math.round(r.total)} ج` } : { ok: false, t: r.error }); router.refresh(); })}>اتسلّم واتحصّل</button>}
        {["ready", "out", "delivered"].includes(o.status) && <button className="btn" onClick={() => window.print()}>🖨️ اطبع البون</button>}
        {canCancel && !["delivered", "cancelled"].includes(o.status) && <span className="row" style={{ marginInlineStart: "auto" }}><input placeholder="سبب الإلغاء" value={reason} onChange={(e) => setReason(e.target.value)} /><button className="btn" disabled={pending} onClick={() => run(setStatus(o.id, "cancelled", undefined, reason), "اتلغى")}>إلغاء الطلب</button></span>}
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </>
  );
}
