"use client";
import { useActionState } from "react";
import { createOrder } from "./actions";

type R = Awaited<ReturnType<typeof createOrder>>;

export default function NewOrder({ items }: { items: { id: number; name: string; unit: string; route: string }[] }) {
  const [res, action, pending] = useActionState<R, FormData>(createOrder, null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="card">
      <h2>أمر إنتاج جديد</h2>
      <div className="row">
        <label className="fld">المنتج<select name="item" required>{items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.route ? ` — ${i.route}` : " (مالوش مشوار)"}</option>)}</select></label>
        <label className="fld">الكمية<input name="qty" inputMode="decimal" dir="ltr" required style={{ width: 100 }} /></label>
        <label className="fld">ميعاده<input type="date" name="due" defaultValue={today} /></label>
        <label className="fld">ملاحظة<input name="note" /></label>
        <button className="btn pri" disabled={pending}>{pending ? "…" : "+ اعمل الأمر"}</button>
      </div>
      {res && (res.ok ? <div className="okmsg">اتعمل الأمر — ظهر في تابلت أول غرفة</div> : <div className="badmsg">{res.error}</div>)}
    </form>
  );
}
