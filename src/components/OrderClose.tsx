"use client";
// قفل الطلب في الفرع: خصم من الفرع، إلغاء التوصيل، ملاحظة للطيار، اختيار الطيار من القايمة، والتحصيل مقسّم على أكتر من طريقة
// نفس المكوّن في شاشة الطلب في الداشبورد وفي تبويب الطلبات في الكاشير
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type CloseO = {
  id: number; status: string; pay_method: string; loc: string; sub: number; fee: number; fee_orig: number | null;
  discount: number; branch_discount: number; branch_discount_note: string | null; rider_note: string | null; rider_id: number | null;
};
type Rider = { id: number; name: string; kind: string; location_id: string | null };
const METHODS: [string, string][] = [["cash", "كاش"], ["instapay", "إنستاباي"], ["wallet", "محفظة"], ["card", "فيزا"]];
const KIND: Record<string, string> = { own: "طيارنا", tudzi: "تودزي", other: "خارجي" };
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function OrderClose({ o, onDone }: { o: CloseO; onDone: (msg: string) => void }) {
  const sb = supabaseBrowser();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [disc, setDisc] = useState(String(o.branch_discount || ""));
  const [why, setWhy] = useState(o.branch_discount_note ?? "");
  const [waive, setWaive] = useState(o.fee_orig != null);
  const [rnote, setRnote] = useState(o.rider_note ?? "");
  const [riders, setRiders] = useState<Rider[]>([]);
  const [rider, setRider] = useState<string>(o.rider_id ? String(o.rider_id) : "");
  const [newR, setNewR] = useState({ name: "", phone: "", kind: "own" });
  const fee = waive ? 0 : Number(o.fee_orig ?? o.fee);
  const total = Math.max(r2(o.sub + fee - Number(o.discount || 0) - (Number(disc) || 0)), 0);
  const def = o.pay_method === "card" ? "card" : o.pay_method === "instapay" ? "instapay" : o.pay_method === "wallet" ? "wallet" : "cash";
  const [pays, setPays] = useState<{ m: string; a: string }[]>([{ m: def, a: "" }]);
  const open = !["delivered", "cancelled"].includes(o.status);

  useEffect(() => {
    sb.from("riders").select("id,name,kind,location_id").eq("active", true).order("name").then(({ data }) => setRiders(((data ?? []) as Rider[]).filter((r) => !r.location_id || r.location_id === o.loc)));
  }, [o.loc]); // eslint-disable-line react-hooks/exhaustive-deps

  const call = async (fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    setBusy(true); setErr(null);
    const { error } = await fn();
    setBusy(false);
    if (error) return setErr(error.message.replace(/^.*?ERROR:\s*/, ""));
    onDone(ok);
  };
  const saveAdj = () => call(() => sb.rpc("order_adjust", { p_id: o.id, p_discount: Number(disc) || 0, p_note: why, p_waive_fee: waive, p_rider_note: rnote }), "اتحفظ");
  const addRider = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await sb.rpc("rider_save", { p_id: null, p_name: newR.name, p_phone: newR.phone, p_kind: newR.kind, p_loc: o.loc });
    setBusy(false);
    if (error) return setErr(error.message.replace(/^.*?ERROR:\s*/, ""));
    setRiders((L) => [...L, { id: Number(data), name: newR.name, kind: newR.kind, location_id: o.loc }]); setRider(String(data)); setNewR({ name: "", phone: "", kind: "own" });
  };
  // التقسيم: الصف الأخير بياخد الباقي لوحده
  const amounts = pays.map((p, i) => (i === pays.length - 1 ? r2(total - pays.slice(0, -1).reduce((a, x) => a + (Number(x.a) || 0), 0)) : Number(p.a) || 0));
  const deliver = () => call(() => sb.rpc("order_deliver_pay", { p_id: o.id, p_pays: o.pay_method === "credit" ? [] : pays.map((p, i) => ({ method: p.m, amount: amounts[i] })) }), "اتسلّم واتحصّل");

  if (!open) return null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <details className="card" open={Number(o.branch_discount) > 0 || o.fee_orig != null || !!o.rider_note}>
        <summary><b>خصم / توصيل / ملاحظة للطيار</b></summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <div className="row">
            <label className="fld">خصم من الفرع (ج)<input value={disc} onChange={(e) => setDisc(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 110 }} /></label>
            <label className="fld" style={{ flex: 1 }}>سبب الخصم<input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="مثلاً: تأخير، صنف ناقص" /></label>
          </div>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} /> إلغاء رسوم التوصيل ({Number(o.fee_orig ?? o.fee)} ج)</label>
          <label className="fld">ملاحظة للطيار<input value={rnote} onChange={(e) => setRnote(e.target.value)} placeholder="مثلاً: كلّم العميل قبل ما توصل" /></label>
          <button className="btn" disabled={busy} onClick={saveAdj} style={{ justifySelf: "start" }}>احفظ</button>
          <div className="muted" style={{ fontSize: 12.5 }}>الخصم وإلغاء التوصيل بصلاحية — وبيتسجّل مين عملها.</div>
        </div>
      </details>

      {o.status === "ready" && (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <b>الطيار</b>
          <div className="row">
            <select value={rider} onChange={(e) => setRider(e.target.value)} style={{ minWidth: 200, height: 42 }}>
              <option value="">اختار الطيار</option>
              {riders.map((r) => <option key={r.id} value={r.id}>{r.name} · {KIND[r.kind] ?? r.kind}</option>)}
            </select>
            <button className="btn pri" disabled={busy || !rider} onClick={() => call(() => sb.rpc("order_out", { p_id: o.id, p_rider: Number(rider) }), "خرج مع الطيار")}>خرج مع الطيار</button>
          </div>
          <details><summary className="muted">+ طيار مش في القايمة</summary>
            <div className="row" style={{ marginTop: 6 }}>
              <input placeholder="الاسم" value={newR.name} onChange={(e) => setNewR({ ...newR, name: e.target.value })} />
              <input placeholder="الموبايل" dir="ltr" inputMode="tel" value={newR.phone} onChange={(e) => setNewR({ ...newR, phone: e.target.value })} style={{ width: 140 }} />
              <select value={newR.kind} onChange={(e) => setNewR({ ...newR, kind: e.target.value })}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button className="btn" disabled={busy || !newR.name.trim()} onClick={addRider}>ضيفه</button>
            </div>
          </details>
        </div>
      )}

      {o.status === "out" && (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>التحصيل</b><b className="num" style={{ fontSize: 20 }}>{total} ج</b></div>
          {o.pay_method === "credit" ? <div className="muted">الطلب ده آجل على حساب العميل — مفيش تحصيل دلوقتي.</div> : (
            <>
              {pays.map((p, i) => (
                <div key={i} className="row">
                  <select value={p.m} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, m: e.target.value } : x)))} style={{ height: 40 }}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  {i === pays.length - 1
                    ? <b className="num" style={{ minWidth: 90 }}>{amounts[i]} ج {pays.length > 1 && <span className="muted">(الباقي)</span>}</b>
                    : <input value={p.a} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} inputMode="decimal" dir="ltr" style={{ width: 110 }} />}
                  {pays.length > 1 && <button className="btn" style={{ height: 32 }} onClick={() => setPays(pays.filter((_, j) => j !== i))}>✕</button>}
                </div>
              ))}
              {pays.length < 4 && <button className="btn" style={{ justifySelf: "start" }} onClick={() => setPays([{ m: "cash", a: "" }, ...pays])}>+ قسّم على طريقة تانية</button>}
              {amounts.some((a) => a < 0) && <div className="badmsg">المبالغ أكبر من الإجمالي</div>}
              <div className="muted" style={{ fontSize: 12.5 }}>الكاش بيتسجّل على الطيار لحد ما يسلّمه في الفرع.</div>
            </>
          )}
          <button className="btn pri" disabled={busy || amounts.some((a) => a < 0)} onClick={deliver} style={{ height: 46 }}>اتسلّم واتحصّل</button>
        </div>
      )}
      {err && <div className="badmsg">{err}</div>}
    </div>
  );
}
