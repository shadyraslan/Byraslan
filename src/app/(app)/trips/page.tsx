import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { createTrip } from "./actions";

export default async function Trips({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const me = await getMe();
  if (!can(me, "trips.load")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: trips }, { data: staff }, { data: br }] = await Promise.all([
    sb.from("trips").select("id,no,truck,driver,status,created_at,left_at,loaded_ok_at,stops").order("id", { ascending: false }).limit(50),
    sb.from("profiles").select("id,name,job").eq("active", true).order("name"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop", "warehouse", "sub", "partner"]).neq("id", "main").order("sort"),
  ]);
  const ln = (id: string) => (br ?? []).find((b) => b.id === id)?.name ?? id;
  return (
    <>
      <div className="top"><h1>تحميل العربيات</h1><Link className="btn" href="/crates" style={{ display: "inline-grid", placeItems: "center" }}>ملصقات الصناديق</Link></div>
      <form action={createTrip} className="card row">
        <label className="fld">العربية<input name="truck" placeholder="عربية 1 — نصف نقل مبرد" required /></label>
        <label className="fld">السواق (بيشوف الرحلة في تطبيق الموظفين)<select name="driver_id"><option value="">—</option>{(staff ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.job ? ` · ${p.job}` : ""}</option>)}</select></label>
        <div className="fld" style={{ flexBasis: "100%" }}>الرحلة رايحة لأنهي فروع؟ (تقدر تزوّد فرع بعدين)
          <div className="row" style={{ gap: 6, marginTop: 4 }}>{(br ?? []).map((b) => (
            <label key={b.id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "6px 12px" }}><input type="checkbox" name="stop" value={b.id} style={{ width: 18, height: 18 }} />{b.name}</label>))}
          </div>
        </div>
        <button className="btn pri">+ رحلة جديدة وابدأ التحميل</button>
      </form>
      {err && <div className="badmsg">{err}</div>}
      <div className="card">
        <table>
          <thead><tr><th>الرحلة</th><th>العربية</th><th>الحالة</th><th>الوقت</th><th></th></tr></thead>
          <tbody>
            {(trips ?? []).map((t) => (
              <tr key={t.id}>
                <td className="num">#{t.no}</td><td>{t.truck}{t.driver ? ` · ${t.driver}` : ""}{t.stops?.length ? <div className="muted" style={{ fontSize: 12 }}>{(t.stops as string[]).map(ln).join(" ← ")}</div> : null}</td>
                <td><span className="pill" style={t.status === "cancelled" ? { color: "var(--bad)" } : undefined}>{t.status === "loading" ? "بتتحمّل" : t.status === "cancelled" ? "اتلغت" : "خرجت"}</span></td>
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
