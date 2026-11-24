"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveAccount, moveMoney, transferMoney, reverseMove } from "./actions";
import { KINDS } from "./kinds";

export type Acc = { id: number; code: string; name: string; kind: string; number: string | null; location_id: string | null; loc_name: string | null; note: string | null; fee_pct: number; fee_fixed: number; active: boolean; balance: number | null };
type Loc = { id: string; name: string };
const f2 = (n: number) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) => start(async () => {
    const r = await fn();
    if (!r.ok) return setMsg({ ok: false, t: r.error ?? "حصل خطأ" });
    setMsg({ ok: true, t: ok }); after?.(); router.refresh();
  });
  return { msg, pending, run };
}

/** فتح خزنة جديدة أو تعديل واحدة */
export function AccountForm({ locs, acc, onDone }: { locs: Loc[]; acc?: Acc; onDone?: () => void }) {
  const [v, setV] = useState({ kind: acc?.kind ?? "safe", name: acc?.name ?? "", code: acc?.code ?? "", number: acc?.number ?? "", location_id: acc?.location_id ?? "", note: acc?.note ?? "",
    fee_pct: acc ? String(acc.fee_pct) : "", fee_fixed: acc ? String(acc.fee_fixed) : "", opening: "" });
  const { msg, pending, run } = useRun();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const fees = ["pos", "gateway", "bank", "wallet", "instapay"].includes(v.kind);
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="row">
        <label className="fld">النوع<select value={v.kind} onChange={set("kind")}>{Object.entries(KINDS).map(([k, x]) => <option key={k} value={k}>{x.ic} {x.label}</option>)}</select></label>
        <label className="fld" style={{ flex: "1 1 220px" }}>الوصف<input value={v.name} onChange={set("name")} placeholder="مثلاً: ماكينة فيزا بنك مصر — فرع رشدي" /></label>
        <label className="fld">الكود الداخلي (اسم مختصر)<input value={v.code} onChange={set("code")} placeholder="POS-BM-RSH" dir="auto" /></label>
        <label className="fld">الرقم<input value={v.number} onChange={set("number")} placeholder="رقم الحساب / المحفظة / الماكينة" dir="ltr" /></label>
        <label className="fld">تبع فرع<select value={v.location_id} onChange={set("location_id")}><option value="">— الشركة كلها —</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        {fees && <label className="fld">عمولة %<input value={v.fee_pct} onChange={set("fee_pct")} inputMode="decimal" dir="ltr" style={{ width: 80 }} /></label>}
        {fees && <label className="fld">عمولة ثابتة ج<input value={v.fee_fixed} onChange={set("fee_fixed")} inputMode="decimal" dir="ltr" style={{ width: 80 }} /></label>}
        {!acc && <label className="fld">الرصيد دلوقتي<input value={v.opening} onChange={set("opening")} inputMode="decimal" dir="ltr" style={{ width: 110 }} placeholder="0" /></label>}
        <label className="fld" style={{ flex: "1 1 200px" }}>ملاحظة<input value={v.note} onChange={set("note")} /></label>
      </div>
      <div className="row">
        <button className="btn pri" disabled={pending} onClick={() => run(() => saveAccount({ ...v, id: acc ? String(acc.id) : null }), acc ? "اتحفظ" : "اتفتحت الخزنة", () => { if (!acc) setV((s) => ({ ...s, name: "", code: "", number: "", note: "", opening: "" })); onDone?.(); })}>{acc ? "احفظ" : "+ افتح الخزنة"}</button>
        {acc && <button className="btn" disabled={pending} onClick={() => run(() => saveAccount({ ...v, id: String(acc.id), active: !acc.active }), acc.active ? "اتقفلت" : "اتفتحت", onDone)}>{acc.active ? "اقفلها (من غير ما تتمسح)" : "رجّعها شغالة"}</button>}
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}

/** تحويل بين خزنتين + إيداع / سحب */
export function MoveForms({ accs, canMove }: { accs: Acc[]; canMove: boolean }) {
  const live = accs.filter((a) => a.active);
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [amt, setAmt] = useState(""); const [fee, setFee] = useState(""); const [note, setNote] = useState("");
  const [acc, setAcc] = useState(""); const [kind, setKind] = useState<"in" | "out">("in"); const [amt2, setAmt2] = useState(""); const [note2, setNote2] = useState("");
  const t = useRun(), m = useRun();
  if (!canMove) return null;
  const fa = live.find((a) => String(a.id) === from);
  const sug = fa && Number(amt) > 0 && (fa.fee_pct || fa.fee_fixed) ? Math.round((Number(amt) * fa.fee_pct / 100 + Number(fa.fee_fixed)) * 100) / 100 : null;
  const opt = (a: Acc) => <option key={a.id} value={a.id}>{KINDS[a.kind]?.ic} {a.code} — {a.name}{a.balance != null ? ` (${f2(a.balance)})` : ""}</option>;
  return (
    <div className="row" style={{ alignItems: "stretch" }}>
      <div className="card" style={{ flex: "2 1 420px", display: "grid", gap: 8, margin: 0 }}>
        <h2 style={{ margin: 0 }}>تحويل بين خزنتين</h2>
        <div className="row">
          <label className="fld" style={{ flex: "1 1 180px" }}>من<select value={from} onChange={(e) => setFrom(e.target.value)}><option value="">—</option>{live.map(opt)}</select></label>
          <label className="fld" style={{ flex: "1 1 180px" }}>لـ<select value={to} onChange={(e) => setTo(e.target.value)}><option value="">—</option>{live.filter((a) => String(a.id) !== from).map(opt)}</select></label>
          <label className="fld">المبلغ<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 110 }} /></label>
          <label className="fld">عمولة (لو فيه)<input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 90 }} placeholder={sug != null ? String(sug) : "0"} /></label>
          <label className="fld" style={{ flex: "1 1 200px" }}>ملاحظة<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: تسوية ماكينة يوم 24" /></label>
        </div>
        {sug != null && !fee && <div className="muted" style={{ fontSize: 12.5 }}>عمولة {fa?.code} المتسجّلة = {sug} ج — اكتبها في خانة العمولة لو اتخصمت فعلاً.</div>}
        <div><button className="btn pri" disabled={t.pending || !from || !to || !(Number(amt) > 0)} onClick={() => t.run(() => transferMoney(Number(from), Number(to), Number(amt), Number(fee) || 0, note), "اتحوّل", () => { setAmt(""); setFee(""); setNote(""); })}>حوّل</button></div>
        {t.msg && <div className={t.msg.ok ? "okmsg" : "badmsg"}>{t.msg.t}</div>}
      </div>
      <div className="card" style={{ flex: "1 1 300px", display: "grid", gap: 8, margin: 0 }}>
        <h2 style={{ margin: 0 }}>إيداع / سحب</h2>
        <div className="row">
          <label className="fld" style={{ flex: "1 1 180px" }}>الخزنة<select value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">—</option>{live.map(opt)}</select></label>
          <label className="fld">النوع<select value={kind} onChange={(e) => setKind(e.target.value as "in" | "out")}><option value="in">إيداع (دخل)</option><option value="out">سحب (خرج)</option></select></label>
          <label className="fld">المبلغ<input value={amt2} onChange={(e) => setAmt2(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 110 }} /></label>
          <label className="fld" style={{ flex: "1 1 200px" }}>السبب (إجباري)<input value={note2} onChange={(e) => setNote2(e.target.value)} /></label>
        </div>
        <div><button className="btn pri" disabled={m.pending || !acc || !(Number(amt2) > 0) || note2.trim().length < 3} onClick={() => m.run(() => moveMoney(Number(acc), kind, Number(amt2), note2), "اتسجّل", () => { setAmt2(""); setNote2(""); })}>سجّل</button></div>
        {m.msg && <div className={m.msg.ok ? "okmsg" : "badmsg"}>{m.msg.t}</div>}
      </div>
    </div>
  );
}

export function EditAccount({ acc, locs }: { acc: Acc; locs: Loc[] }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button className="btn" style={{ height: 30 }} onClick={() => setOpen(true)}>تعديل</button>;
  return <div style={{ gridColumn: "1 / -1" }}><AccountForm locs={locs} acc={acc} onDone={() => setOpen(false)} /><button className="btn" style={{ marginTop: 6 }} onClick={() => setOpen(false)}>رجوع</button></div>;
}

export function ReverseBtn({ id }: { id: number }) {
  const [open, setOpen] = useState(false); const [why, setWhy] = useState("");
  const { msg, pending, run } = useRun();
  if (!open) return <button className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => setOpen(true)}>اعكس</button>;
  return (
    <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="السبب" style={{ height: 28, width: 130 }} autoFocus />
      <button className="btn" style={{ height: 28, fontSize: 12 }} disabled={pending || why.trim().length < 3} onClick={() => run(() => reverseMove(id, why), "اتعكست")}>أكّد</button>
      {msg && !msg.ok && <span className="badmsg" style={{ fontSize: 12 }}>{msg.t}</span>}
    </span>
  );
}
