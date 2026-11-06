import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { cairoDayStart } from "@/lib/time";
import Tabs from "./Tabs";
import Selfie from "./Selfie";
import { decideAttendance, resetDevice } from "./actions";

type A = { id: number; user_id: string; kind: string; at: string; location_id: string | null; distance_m: number | null; selfie: string | null; status: string; flags: string[]; report: string | null };
const t = (s: string) => new Date(s).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" });

export default async function Hr() {
  const me = await getMe();
  if (!can(me, "hr.view") && !can(me, "hr.attendance")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: att }, { data: people }, { data: locs }, { data: pend }] = await Promise.all([
    sb.from("attendance").select("*").gte("at", cairoDayStart()).order("at"),
    sb.from("profiles").select("id,name,job,home_loc,active").eq("active", true).order("name"),
    sb.from("locations").select("id,name,lat"),
    sb.from("attendance").select("*").eq("status", "pending").order("at", { ascending: false }).limit(50),
  ]);
  const A = (att ?? []) as A[];
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const noGeo = (locs ?? []).filter((l) => l.lat == null).length;
  const rows = (people ?? []).map((p) => {
    const mine = A.filter((a) => a.user_id === p.id && a.status !== "rejected");
    const first = mine.find((a) => a.kind === "in");
    const last = mine[mine.length - 1];
    return { p, first, last, in: last?.kind === "in" };
  });
  const present = rows.filter((r) => r.in).length;
  const canDecide = can(me, "hr.attendance");
  return (
    <>
      <div className="top"><h1>الحضور النهارده</h1></div>
      <Tabs cur="/hr" />
      {noGeo > 0 && <div className="card" style={{ borderColor: "var(--bad)" }}>فيه {noGeo} موقع لسه مالوش إحداثيات — الحضور فيه هيستنى موافقة. حدّدها من <a href="/locations"><b>أماكن الحضور</b></a>.</div>}
      <div className="kpis">
        <div className="kpi"><span>حاضر دلوقتي</span><b className="num">{present}</b></div>
        <div className="kpi"><span>سجّل النهارده</span><b className="num">{rows.filter((r) => r.first).length}</b></div>
        <div className="kpi"><span>لسه ماسجّلش</span><b className="num">{rows.filter((r) => !r.first).length}</b></div>
        <div className="kpi"><span>مستني موافقة</span><b className="num" style={{ color: (pend ?? []).length ? "var(--bad)" : undefined }}>{(pend ?? []).length}</b></div>
      </div>
      {!!(pend ?? []).length && (
        <div className="card">
          <h2>استثناءات مستنية قرار</h2>
          {((pend ?? []) as A[]).map((a) => (
            <div key={a.id} className="row" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8, alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 260px" }}>
                <b>{PN.get(a.user_id)}</b> · {a.kind === "in" ? "حضور" : "انصراف"} <span className="num">{new Date(a.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</span>
                <div style={{ color: "var(--bad)", fontSize: 13 }}>{a.flags.join(" · ")}</div>
                {a.report && <div className="muted" style={{ fontSize: 13 }}>التقرير: {a.report}</div>}
              </div>
              {a.selfie && <Selfie path={a.selfie} />}
              {canDecide && (
                <form action={decideAttendance} className="row" style={{ gap: 6 }}>
                  <input type="hidden" name="id" value={a.id} />
                  <input name="note" placeholder="ملاحظة" style={{ width: 140, height: 34 }} />
                  <button name="ok" value="1" className="btn pri" style={{ height: 34 }}>وافق</button>
                  <button name="ok" value="0" className="btn" style={{ height: 34 }}>ارفض = غياب</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>مكانه</th><th>أول حضور</th><th>آخر تسجيل</th><th>فين</th><th></th></tr></thead>
          <tbody>
            {rows.map(({ p, first, last, in: isIn }) => (
              <tr key={p.id}>
                <td><b>{p.name}</b> <span className="muted" style={{ fontSize: 12 }}>{p.job}</span></td>
                <td>{LN.get(p.home_loc as string) ?? "—"}</td>
                <td className="num">{first ? t(first.at) : <span className="muted">—</span>}</td>
                <td>{last ? <span style={{ color: isIn ? "var(--good)" : undefined }}>{isIn ? "🟢 حاضر" : "🔴 انصرف"} <span className="num">{t(last.at)}</span>{last.status === "pending" ? " · مستني" : ""}</span> : "—"}</td>
                <td>{last?.location_id ? `${LN.get(last.location_id)}${last.distance_m != null ? ` · ${last.distance_m}م` : ""}` : "—"}</td>
                <td>{canDecide && <form action={resetDevice}><input type="hidden" name="user" value={p.id} /><button className="btn" style={{ height: 30, fontSize: 12 }} title="الموظف غيّر موبايله: أول تسجيل جاي يتسجّل كموبايله الجديد">موبايل جديد</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
