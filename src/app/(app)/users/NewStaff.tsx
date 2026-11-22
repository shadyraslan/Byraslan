"use client";
import { useActionState, useState } from "react";
import { createStaff } from "./staff";
import { ROLES } from "@/lib/roles";

type R = Awaited<ReturnType<typeof createStaff>>;
type L = { id: string | number; name: string };

/** مكان الشغل: فرع معيّن / خارج الفروع / مورد — بيتستخدم في «موظف جديد» وفي تعديل موظف */
export function WorkPlace({ locs, sups, w0 = "branch", loc0 = "", sup0 = "" }: { locs: L[]; sups: L[]; w0?: string; loc0?: string; sup0?: string }) {
  const [w, setW] = useState(w0);
  return (
    <>
      <label className="fld">مكان الشغل<select name="work_place" value={w} onChange={(e) => setW(e.target.value)}>
        <option value="branch">فرع</option><option value="outside">خارج الفروع (مكتب/مصنع/سواق…)</option><option value="supplier">مورد</option>
      </select></label>
      {w === "branch" && <label className="fld">الفرع<select name="home_loc" defaultValue={loc0} required><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
      {w === "supplier" && <label className="fld">المورد<select name="supplier_id" defaultValue={sup0} required><option value="">—</option>{sups.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
    </>
  );
}

export default function NewStaff({ locs, sups }: { locs: L[]; sups: L[] }) {
  const [res, action, pending] = useActionState<R, FormData>(createStaff, null);
  const [name, setName] = useState("");
  const [login, setLogin] = useState<string | null>(null);
  return (
    <form action={action} className="card">
      <h2>موظف جديد</h2>
      <div className="row">
        <label className="fld">الاسم<input name="name" required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="fld">اسم المستخدم (بيدخل بيه)<input name="login" required value={login ?? name} onChange={(e) => setLogin(e.target.value)} /></label>
        <label className="fld">الرقم السري (مش متسلسل ولا متكرر)<input name="password" dir="ltr" required minLength={4} /></label>
        <label className="fld">الموبايل (اختياري)<input name="phone" inputMode="tel" dir="ltr" /></label>
        <label className="fld">الوظيفة<input name="job" placeholder="مثلًا: كاشير رشدي" /></label>
        <WorkPlace locs={locs} sups={sups} />
        <label className="fld">صلاحيات جاهزة<select name="role"><option value="">— من غير (هتديله بعدين) —</option>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <button className="btn pri" disabled={pending}>{pending ? "…" : "+ اعمل الحساب"}</button>
      </div>
      {res && (res.ok ? <div className="okmsg">اتعمل الحساب — يدخل باسم المستخدم «{res.name}» والرقم السري</div> : <div className="badmsg">{res.error}</div>)}
    </form>
  );
}
