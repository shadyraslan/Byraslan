"use client";
import { useActionState, useState } from "react";
import { send } from "./actions";

type Opt = { id: string | number; name: string };
export default function SendForm({ districts, locs, people }: { districts: Opt[]; locs: Opt[]; people: Opt[] }) {
  const [app, setApp] = useState("customer");
  const [target, setTarget] = useState("all");
  const [st, act, pending] = useActionState(send, null);
  const T = app === "customer"
    ? [["all", "كل العملاء"], ["district", "منطقة"], ["branch", "عملاء فرع"], ["phone", "عميل برقمه"]]
    : [["all", "كل الموظفين"], ["loc", "موظفين مكان"], ["user", "موظف"]];
  return (
    <form action={act} className="card" style={{ display: "grid", gap: 10 }}>
      <h2>إشعار أو رسالة جديدة</h2>
      <input type="hidden" name="app" value={app} /><input type="hidden" name="target" value={target} />
      <div className="row">{[["customer", "تطبيق العملاء"], ["staff", "تطبيق الموظفين"]].map(([k, l]) => <button type="button" key={k} className={app === k ? "btn pri" : "btn"} onClick={() => { setApp(k); setTarget("all"); }}>{l}</button>)}</div>
      <div className="row">{T.map(([k, l]) => <button type="button" key={k} className={target === k ? "btn pri" : "btn"} onClick={() => setTarget(k)}>{l}</button>)}</div>
      {target === "district" && <select name="district">{districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      {(target === "branch" || target === "loc") && <select name="loc">{locs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      {target === "phone" && <input name="phone" placeholder="01xxxxxxxxx" dir="ltr" />}
      {target === "user" && <select name="user">{people.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}
      <input name="title" placeholder="العنوان" required />
      <textarea name="body" rows={3} placeholder="الرسالة" required />
      {app === "staff" && <label className="row" style={{ gap: 6 }}><input type="checkbox" name="ack" style={{ width: 20, height: 20 }} /> محتاجة "قريت وموافق"</label>}
      <button className="btn pri" disabled={pending}>{pending ? "…" : "ابعت"}</button>
      {st && <div className={st.ok ? "okmsg" : "badmsg"}>{st.t}</div>}
    </form>
  );
}
