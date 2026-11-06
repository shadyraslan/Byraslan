import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { createTrip } from "./actions";

export default async function Trips() {
  const me = await getMe();
  if (!can(me, "trips.load")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: trips }, { data: staff }] = await Promise.all([
    sb.from("trips").select("id,no,truck,driver,status,created_at,left_at,loaded_ok_at").order("id", { ascending: false }).limit(50),
    sb.from("profiles").select("id,name,job").eq("active", true).order("name"),
  ]);
  return (
    <>
      <div className="top"><h1>تحميل العربيات</h1><Link className="btn" href="/crates" style={{ display: "inline-grid", placeItems: "center" }}>ملصقات الصناديق</Link></div>
      <form action={createTrip} className="card row">
        <label className="fld">العربية<input name="truck" placeholder="عربية 1 — نصف نقل مبرد" required /></label>
        <label className="fld">السواق (بيشوف الرحلة في تطبيق الموظفين)<select name="driver_id"><option value="">—</option>{(staff ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.job ? ` · ${p.job}` : ""}</option>)}</select></label>
        <button className="btn pri">+ رحلة جديدة وابدأ التحميل</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>الرحلة</th><th>العربية</th><th>الحالة</th><th>الوقت</th><th></th></tr></thead>
          <tbody>
            {(trips ?? []).map((t) => (
              <tr key={t.id}>
                <td className="num">#{t.no}</td><td>{t.truck}{t.driver ? ` · ${t.driver}` : ""}</td>
                <td><span className="pill">{t.status === "loading" ? "بتتحمّل" : "خرجت"}</span></td>
                <td className="num" style={{ fontSize: 12 }}>{new Date(t.left_at ?? t.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                <td><Link className="btn" href={`/trips/${t.id}`} style={{ display: "inline-grid", placeItems: "center", height: 32 }}>{t.status === "loading" ? "كمّل التحميل" : "اعرض"}</Link></td>
              </tr>
            ))}
            {!trips?.length && <tr><td colSpan={5} className="muted">لسه مفيش رحلات</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
