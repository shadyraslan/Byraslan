"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { paySupplier } from "../../actions";

export default function Pay({ sup, balance }: { sup: number; balance: number }) {
  const router = useRouter();
  const [amt, setAmt] = useState(balance > 0 ? String(Math.round(balance)) : "");
  const [m, setM] = useState("cash");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <h2>دفعة للمورد</h2>
      <div className="row">
        <label className="fld">المبلغ<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" dir="ltr" /></label>
        <label className="fld">الطريقة<select value={m} onChange={(e) => setM(e.target.value)}><option value="cash">كاش</option><option value="instapay">إنستاباي</option><option value="bank">تحويل بنكي</option><option value="check">شيك</option></select></label>
        <label className="fld">رقم العملية / الشيك<input value={ref} onChange={(e) => setRef(e.target.value)} dir="ltr" /></label>
        <label className="fld" style={{ flex: "1 1 200px" }}>ملاحظة<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="btn pri" disabled={pending} onClick={() => start(async () => {
          const r = await paySupplier(sup, Number(amt), m, ref, note);
          setMsg(r.ok ? { ok: true, t: `اتسجلت الدفعة PAY-${r.no}` } : { ok: false, t: r.error }); if (r.ok) { setRef(""); setNote(""); router.refresh(); }
        })}>سجّل الدفعة</button>
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}
