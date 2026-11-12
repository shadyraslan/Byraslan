"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type L = { line: number; item_id: number; name: string; unit: string; box_sn: number | null; qty: number; unit_price: number; net_price: number; returned: number };
type S = { id: number; no: number; at: string; branch: string; days: number; max_days: number; limit: number | null; total: number; discount: number; returned: number; customer: string | null;
  paid: { cash: number; card: number; credit: number; staff: number; points: number }; lines: L[] };
export type Ret = { no: number; sale_no: number; branch: string; at: string; reason: string; total: number; refund_cash: number; refund_card: number; refund_credit: number; refund_staff: number;
  refund_points_value: number; points_back: number; points_taken: number; lines: { name: string; qty: number; total: number; restock: boolean }[] };
const f2 = (n: number) => Number(n).toLocaleString("ar-EG", { maximumFractionDigits: 2 });
const REASONS = ["العميل غيّر رأيه", "الصنف بايظ / تالف", "صلاحية", "غلط في الفاتورة", "مقاس / نوع غلط"];

/** مرتجع فاتورة كاشير — نفس الشاشة في الكاشير والداشبورد. الحد والصلاحية من pos.return */
export default function ReturnBox({ shiftClient, onDone, onClose }: { shiftClient?: string | null; onDone?: (r: Ret) => void; onClose?: () => void }) {
  const sb = supabaseBrowser();
  const [no, setNo] = useState("");
  const [s, setS] = useState<S | null>(null);
  const [q, setQ] = useState<Record<number, string>>({});
  const [rs, setRs] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Ret | null>(null);
  const E = (e: { message: string }) => setErr(e.message.replace(/^.*?ERROR:\s*/, ""));
  const find = async () => {
    setErr(null); setS(null); setQ({}); setRs({});
    const { data, error } = await sb.rpc("pos_sale_lookup", { p_no: Number(no.replace(/\D/g, "")) });
    if (error) return E(error);
    setS(data as S);
  };
  const tot = s ? s.lines.reduce((a, l) => a + (Number(q[l.line]) || 0) * l.net_price, 0) : 0;
  const late = s ? s.days > s.max_days : false;
  const over = s && s.limit != null && tot > s.limit;
  const go = async () => {
    if (!s) return;
    setBusy(true); setErr(null);
    const lines = s.lines.filter((l) => Number(q[l.line]) > 0).map((l) => ({ line: l.line, qty: Number(q[l.line]), restock: rs[l.line] ?? true }));
    const { data, error } = await sb.rpc("pos_return", { p_sale: s.id, p_lines: lines, p_reason: reason, p_shift_client: shiftClient ?? null });
    setBusy(false);
    if (error) return E(error);
    setDone(data as Ret); onDone?.(data as Ret);
  };
  const print = () => window.print();

  if (done) return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <style>{`@media print { body * { visibility: hidden } #rr, #rr * { visibility: visible } #rr { position: absolute; inset: 0 auto auto 0; width: 72mm; font-size: 12px } }`}</style>
      <div id="rr" style={{ display: "grid", gap: 4 }}>
        <b style={{ textAlign: "center" }}>باي رسلان — {done.branch}</b>
        <b style={{ textAlign: "center" }}>إيصال مرتجع R-{done.no}</b>
        <div>على فاتورة S-{done.sale_no} · {new Date(done.at).toLocaleString("ar-EG")}</div>
        {done.lines.map((l, i) => <div key={i} className="row" style={{ justifyContent: "space-between" }}><span>{l.name} × {l.qty}{l.restock ? "" : " (تالف)"}</span><span>{f2(l.total)}</span></div>)}
        <hr />
        <div className="row" style={{ justifyContent: "space-between" }}><b>إجمالي المرتجع</b><b>{f2(done.total)}</b></div>
        {done.refund_cash > 0 && <div className="row" style={{ justifyContent: "space-between" }}><span>كاش للعميل</span><span>{f2(done.refund_cash)}</span></div>}
        {done.refund_card > 0 && <div className="row" style={{ justifyContent: "space-between" }}><span>يترجع على الفيزا</span><span>{f2(done.refund_card)}</span></div>}
        {done.refund_credit > 0 && <div className="row" style={{ justifyContent: "space-between" }}><span>اتخصم من حساب الآجل</span><span>{f2(done.refund_credit)}</span></div>}
        {done.refund_staff > 0 && <div className="row" style={{ justifyContent: "space-between" }}><span>اتشال من حساب الموظف</span><span>{f2(done.refund_staff)}</span></div>}
        {done.points_back > 0 && <div className="row" style={{ justifyContent: "space-between" }}><span>نقاط رجعت</span><span>+{done.points_back}</span></div>}
        {done.points_taken > 0 && <div className="row" style={{ justifyContent: "space-between" }}><span>نقاط اتشالت</span><span>-{done.points_taken}</span></div>}
        <div>السبب: {done.reason}</div>
        <div style={{ marginTop: 12 }}>توقيع العميل: ..................</div>
      </div>
      {done.refund_cash > 0 && <div className="okmsg">ادّي العميل {f2(done.refund_cash)} ج كاش من الدرج</div>}
      {done.refund_card > 0 && <div className="okmsg">رجّع {f2(done.refund_card)} ج على ماكينة الفيزا</div>}
      <div className="row"><button className="btn pri" onClick={print}>🖨 اطبع إيصال المرتجع</button>{onClose && <button className="btn" onClick={onClose}>قفل</button>}</div>
    </div>
  );

  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ justifyContent: "space-between" }}><b>مرتجع فاتورة</b>{onClose && <button className="btn" onClick={onClose}>قفل</button>}</div>
      <div className="row"><input value={no} onChange={(e) => setNo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} placeholder="رقم الفاتورة (من الإيصال)" inputMode="numeric" dir="ltr" style={{ flex: 1 }} autoFocus /><button className="btn" onClick={find}>هات</button></div>
      {s && (
        <>
          <div className="muted">S-{s.no} · {s.branch} · {new Date(s.at).toLocaleString("ar-EG")} · {f2(s.total)} ج{s.customer ? ` · ${s.customer}` : ""}{s.returned > 0 ? ` · اترجع منها قبل كده ${f2(s.returned)} ج` : ""}</div>
          <div className="muted" style={{ fontSize: 12 }}>اندفعت: {[["كاش", s.paid.cash], ["فيزا", s.paid.card], ["آجل", s.paid.credit], ["حساب موظف", s.paid.staff], ["نقاط", s.paid.points]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${f2(Number(v))}`).join(" · ")} — المرتجع بيرجع بنفس النسبة</div>
          {late && <div className="badmsg">عدّى {s.days} يوم — المسموح {s.max_days}</div>}
          <table><tbody>{s.lines.map((l) => {
            const left = l.qty - l.returned;
            return (
              <tr key={l.line} style={{ opacity: left <= 0 ? 0.5 : 1 }}>
                <td><b>{l.name}</b><div className="muted" style={{ fontSize: 12 }}>{l.qty} {l.unit} × {f2(l.net_price)}{l.returned ? ` · رجع ${l.returned}` : ""}</div></td>
                <td>{left > 0 && (l.box_sn
                  ? <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={Number(q[l.line]) > 0} onChange={(e) => setQ({ ...q, [l.line]: e.target.checked ? String(l.qty) : "" })} /> رجّع العلبة</label>
                  : <input value={q[l.line] ?? ""} onChange={(e) => setQ({ ...q, [l.line]: e.target.value })} placeholder={`لحد ${left}`} inputMode="decimal" dir="ltr" style={{ width: 80 }} />)}</td>
                <td>{Number(q[l.line]) > 0 && <label className="row" style={{ gap: 4, fontSize: 13 }}><input type="checkbox" checked={rs[l.line] ?? true} onChange={(e) => setRs({ ...rs, [l.line]: e.target.checked })} /> يرجع المخزن</label>}</td>
              </tr>); })}</tbody></table>
          <div className="row" style={{ gap: 4 }}>{REASONS.map((x) => <button key={x} className={reason === x ? "btn pri" : "btn"} onClick={() => setReason(x)}>{x}</button>)}</div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب" />
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>المرتجع: {f2(tot)} ج</b>
            {over && <span className="badmsg">حدّك {f2(s.limit!)} ج</span>}
            <button className="btn pri" disabled={busy || tot <= 0 || late || !!over || reason.trim().length < 3} onClick={go}>{busy ? "…" : "نفّذ المرتجع"}</button>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>شيل علامة «يرجع المخزن» لو الصنف تالف ومش هيتباع تاني.</div>
        </>
      )}
      {err && <div className="badmsg">{err}</div>}
    </div>
  );
}
