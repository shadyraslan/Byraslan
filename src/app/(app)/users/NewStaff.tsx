"use client";
import { useActionState } from "react";
import { createStaff } from "./staff";
import { ROLES } from "@/lib/roles";

type R = Awaited<ReturnType<typeof createStaff>>;

export default function NewStaff({ locs }: { locs: { id: string; name: string }[] }) {
  const [res, action, pending] = useActionState<R, FormData>(createStaff, null);
  return (
    <form action={action} className="card">
      <h2>موظف جديد</h2>
      <div className="row">
        <label className="fld">الاسم<input name="name" required /></label>
        <label className="fld">الموبايل (بيدخل بيه)<input name="phone" inputMode="tel" dir="ltr" required /></label>
        <label className="fld">الرقم السري (مش متسلسل ولا متكرر)<input name="password" inputMode="numeric" dir="ltr" required minLength={4} /></label>
        <label className="fld">الوظيفة<input name="job" placeholder="مثلًا: كاشير رشدي" /></label>
        <label className="fld">الفرع الأساسي<select name="home_loc"><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">صلاحيات جاهزة<select name="role"><option value="">— من غير (هتديله بعدين) —</option>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></label>
        <button className="btn pri" disabled={pending}>{pending ? "…" : "+ اعمل الحساب"}</button>
      </div>
      {res && (res.ok ? <div className="okmsg">اتعمل حساب {res.name} — يدخل بالموبايل والرقم السري</div> : <div className="badmsg">{res.error}</div>)}
    </form>
  );
}
