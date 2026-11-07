import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveStaffDoc, saveDocTypes } from "../more-actions";
import Photo from "./Photo";

type D = { user_id: string; name: string; type: string; type_name: string; block: boolean; id: number | null; number: string | null; expires: string | null; photo: string | null; days_left: number | null; state: string };
type T = { key: string; name: string; alert_days: number; block: boolean; locs: string[] };
const ST: Record<string, [string, string]> = { expired: ["خلصت", "var(--bad)"], missing: ["مش موجودة", "var(--bad)"], soon: ["قرّبت تخلص", "#B7791F"], ok: ["سارية", "var(--good)"] };

/** مستندات الموظفين: الشهادة الصحية والرخصة والبطاقة والعقد — اللي ناقص وقرّب يخلص وخلص */
export default async function StaffDocs({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; f?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.staffdocs") && !can(me, "hr.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: cfg }, { data: locs }] = await Promise.all([
    sb.rpc("docs_status", { p_user: null }),
    sb.from("settings").select("value").eq("key", "hr.doc_types").maybeSingle(),
    sb.from("locations").select("id,name").eq("active", true).order("sort"),
  ]);
  const all = (data ?? []) as D[];
  const f = sp.f ?? "need";
  const L = all.filter((d) => f === "all" || (f === "need" ? d.state !== "ok" : d.state === f));
  const types = (cfg?.value ?? []) as T[];
  const n = (s: string) => all.filter((d) => d.state === s).length;
  const edit = can(me, "hr.staffdocs");
  return (
    <>
      <div className="top"><h1>مستندات الموظفين</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="kpis">
        <a className={`kpi${n("expired") ? " hl" : ""}`} href="/hr/staffdocs?f=expired"><span>خلصت</span><b className="num">{n("expired")}</b></a>
        <a className="kpi" href="/hr/staffdocs?f=soon"><span>قرّبت تخلص</span><b className="num">{n("soon")}</b></a>
        <a className="kpi" href="/hr/staffdocs?f=missing"><span>ناقصة</span><b className="num">{n("missing")}</b></a>
        <a className="kpi" href="/hr/staffdocs?f=all"><span>الكل</span><b className="num">{all.length}</b></a>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>المستند</th><th>الحالة</th><th>بتخلص</th><th>{edit ? "تحديث" : ""}</th></tr></thead>
          <tbody>
            {L.map((d) => (
              <tr key={`${d.user_id}-${d.type}`}>
                <td><b>{d.name}</b></td>
                <td>{d.type_name}{d.block && <div className="muted" style={{ fontSize: 11.5 }}>المنتهية بتمنع الحضور</div>}</td>
                <td style={{ color: ST[d.state][1], fontWeight: 700 }}>{ST[d.state][0]}</td>
                <td className="muted">{d.expires ?? "—"}{d.days_left != null && d.state !== "ok" ? ` (${d.days_left < 0 ? `من ${-d.days_left} يوم` : `بعد ${d.days_left} يوم`})` : ""} {d.photo && <Photo path={d.photo} />}</td>
                <td>{edit && (
                  <form action={saveStaffDoc} className="row" style={{ gap: 4 }}>
                    <input type="hidden" name="user" value={d.user_id} /><input type="hidden" name="type" value={d.type} /><input type="hidden" name="f" value={f} />
                    {d.photo && <input type="hidden" name="photo" value={d.photo} />}
                    <input name="number" placeholder="الرقم" defaultValue={d.number ?? ""} style={{ width: 100 }} dir="ltr" />
                    <input type="date" name="expires" defaultValue={d.expires ?? ""} />
                    <button className="btn">حفظ</button>
                  </form>
                )}</td>
              </tr>
            ))}
            {!L.length && <tr><td colSpan={5} className="muted">كله تمام 👌</td></tr>}
          </tbody>
        </table>
        <div className="note">الموظف بيوصله تنبيه قبل الانتهاء ويوم الانتهاء، ويقدر يصوّر الجديدة من تطبيقه (هتظهر هنا بالصورة).</div>
      </div>
      {can(me, "settings.edit") && (
        <details className="card">
          <summary><b>أنواع المستندات</b> — لمين، والتنبيه قبلها بكام يوم، وهل المنتهية بتمنع الشغل</summary>
          <form action={saveDocTypes} style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {[...types, { key: "", name: "", alert_days: 30, block: false, locs: [] }].map((t, i) => (
              <div key={i} className="row" style={{ gap: 6 }}>
                <input type="hidden" name="key" value={t.key} />
                <input name="name" defaultValue={t.name} placeholder={t.key ? "" : "نوع جديد"} style={{ flex: 1 }} />
                <label className="fld">تنبيه قبل (يوم)<input name="alert" type="number" defaultValue={t.alert_days} style={{ width: 70 }} /></label>
                <label><input type="checkbox" name="block" value={i} defaultChecked={t.block} /> المنتهية تمنع الحضور</label>
                <label className="fld" style={{ flex: 1 }}>لمواقع (أكواد بفاصلة، فاضي = الكل)<input name="locs" defaultValue={t.locs.join(",")} dir="ltr" placeholder={(locs ?? []).slice(0, 3).map((l) => l.id).join(",")} /></label>
              </div>
            ))}
            <button className="btn pri" style={{ justifySelf: "start" }}>حفظ</button>
          </form>
        </details>
      )}
    </>
  );
}
