import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Export from "./Export";

type G = { user_id: string; perm: string; until: string | null; max_amount: number | null; granted_by: string | null; created_at: string };
type P = { id: string; grp: string; label: string };
type U = { id: string; name: string; job: string | null; home_loc: string | null; active: boolean; is_owner: boolean; is_test: boolean };

/** تقرير الصلاحيات: مين معاه إيه، لحد إمتى، بحد كام، ومين اداهاله — بالصلاحية أو بالشخص، مع اللي قرّب يخلص واللي من غير حد */
export default async function PermsReport({ searchParams }: { searchParams: Promise<{ v?: string; days?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "users.manage")) redirect("/dashboard");
  const view = sp.v === "people" ? "people" : "perms";
  const soonDays = Math.max(1, Number(sp.days ?? 7));
  const sb = await supabaseServer();
  const [{ data: gs }, { data: ps }, { data: us }, { data: locs }] = await Promise.all([
    sb.from("grants").select("user_id,perm,until,max_amount,granted_by,created_at"),
    sb.from("permissions").select("id,grp,label").order("grp").order("id"),
    sb.from("profiles").select("id,name,job,home_loc,active,is_owner,is_test"),
    sb.from("locations").select("id,name"),
  ]);
  const G = (gs ?? []) as G[], PM = (ps ?? []) as P[], UU = (us ?? []) as U[];
  const UN = new Map(UU.map((u) => [u.id, u]));
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const soon = new Date(Date.now() + soonDays * 864e5).toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const state = (g: G) => (g.until && g.until < today ? "expired" : g.until && g.until <= soon ? "soon" : "ok");
  const limited = (p: string) => PM.find((x) => x.id === p)?.label.includes("الحد") ?? false;
  const owners = UU.filter((u) => u.is_owner && u.active);
  const live = G.filter((g) => UN.get(g.user_id)?.active !== false);
  const nm = (id: string | null) => (id ? UN.get(id)?.name ?? "—" : "—");
  const cell = (g: G) => {
    const st = state(g);
    return (
      <span>
        {g.until ? <span style={{ color: st === "expired" ? "var(--bad)" : st === "soon" ? "#b7791f" : undefined }}>{st === "expired" ? "انتهت " : "لحد "}{g.until}</span> : <span className="muted">مفتوحة</span>}
        {g.max_amount != null ? <> · حد {Number(g.max_amount).toLocaleString("en-US")} ج</> : limited(g.perm) ? <span style={{ color: "#b7791f" }}> · من غير حد</span> : null}
      </span>
    );
  };
  const rows = live.map((g) => ({ "الموظف": nm(g.user_id), "الفرع": LN.get(UN.get(g.user_id)?.home_loc ?? "") ?? "كل الفروع", "القسم": PM.find((p) => p.id === g.perm)?.grp ?? "", "الصلاحية": PM.find((p) => p.id === g.perm)?.label ?? g.perm,
    "لحد": g.until ?? "مفتوحة", "الحد": g.max_amount ?? "", "اداها": nm(g.granted_by), "من": g.created_at?.slice(0, 10) }));
  const expiring = live.filter((g) => state(g) === "soon"), expired = live.filter((g) => state(g) === "expired");
  const noLimit = live.filter((g) => g.max_amount == null && limited(g.perm));
  const empty = PM.filter((p) => !live.some((g) => g.perm === p.id));
  const groups = [...new Set(PM.map((p) => p.grp))];
  return (
    <>
      <div className="top"><h1>تقرير الصلاحيات</h1><Export rows={rows} /></div>
      <div className="row noprint" style={{ marginBottom: 10 }}>
        <Link className={view === "perms" ? "btn pri" : "btn"} href="/users/report" style={{ display: "inline-grid", placeItems: "center" }}>بالصلاحية</Link>
        <Link className={view === "people" ? "btn pri" : "btn"} href="/users/report?v=people" style={{ display: "inline-grid", placeItems: "center" }}>بالموظف</Link>
        <Link className="btn" href="/users" style={{ display: "inline-grid", placeItems: "center", marginInlineStart: "auto" }}>إدارة الصلاحيات</Link>
      </div>
      <div className="lg-sum" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 12 }}>
        <div className="card" style={{ margin: 0 }}><div className="muted">صلاحيات متدّية</div><b style={{ fontSize: 20 }}>{live.length}</b><div className="muted" style={{ fontSize: 12 }}>لـ {new Set(live.map((g) => g.user_id)).size} موظف + المالك ({owners.length}) معاه كله</div></div>
        <div className="card" style={{ margin: 0, borderColor: expiring.length ? "#b7791f" : undefined }}><div className="muted">بتخلص خلال {soonDays} أيام</div><b style={{ fontSize: 20, color: expiring.length ? "#b7791f" : undefined }}>{expiring.length}</b></div>
        <div className="card" style={{ margin: 0, borderColor: expired.length ? "var(--bad)" : undefined }}><div className="muted">خلصت (مش شغالة)</div><b style={{ fontSize: 20, color: expired.length ? "var(--bad)" : undefined }}>{expired.length}</b></div>
        <div className="card" style={{ margin: 0, borderColor: noLimit.length ? "#b7791f" : undefined }}><div className="muted">صلاحيات فلوس من غير حد</div><b style={{ fontSize: 20 }}>{noLimit.length}</b></div>
        <div className="card" style={{ margin: 0 }}><div className="muted">صلاحيات محدش معاه</div><b style={{ fontSize: 20 }}>{empty.length}</b><div className="muted" style={{ fontSize: 12 }}>غير المالك</div></div>
      </div>

      {view === "perms" ? groups.map((gr) => (
        <div key={gr} className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>{gr}</h2>
          {PM.filter((p) => p.grp === gr).map((p) => {
            const hs = live.filter((g) => g.perm === p.id);
            return (
              <div key={p.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                <b>{p.label}</b>
                {hs.length ? (
                  <div style={{ display: "grid", gap: 3, marginTop: 4 }}>
                    {hs.map((g) => (
                      <div key={g.user_id} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                        <span>👤 {nm(g.user_id)} <span className="muted">· {LN.get(UN.get(g.user_id)?.home_loc ?? "") ?? "كل الفروع"}</span></span>
                        <span>{cell(g)} <span className="muted">· اداها {nm(g.granted_by)}</span></span>
                      </div>
                    ))}
                  </div>
                ) : <div className="muted" style={{ fontSize: 13 }}>محدش معاه غير المالك</div>}
              </div>
            );
          })}
        </div>
      )) : (
        <div className="card" style={{ overflowX: "auto" }}>
          {UU.filter((u) => !u.is_test && u.active && !u.is_owner).sort((a, b) => a.name.localeCompare(b.name, "ar")).map((u) => {
            const mine = live.filter((g) => g.user_id === u.id);
            return (
              <details key={u.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                <summary><b>{u.name}</b> <span className="muted">· {u.job ?? ""} · {LN.get(u.home_loc ?? "") ?? "كل الفروع"} · {mine.length} صلاحية{mine.some((g) => state(g) === "soon") ? " · ⚠ فيه حاجة قرّبت تخلص" : ""}</span></summary>
                <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
                  {mine.map((g) => (
                    <div key={g.perm} className="row" style={{ justifyContent: "space-between", fontSize: 14 }}>
                      <span>{PM.find((p) => p.id === g.perm)?.label ?? g.perm} <span className="muted">({PM.find((p) => p.id === g.perm)?.grp})</span></span>
                      <span>{cell(g)} <span className="muted">· اداها {nm(g.granted_by)}</span></span>
                    </div>
                  ))}
                  {!mine.length && <div className="muted">مالوش صلاحيات</div>}
                </div>
              </details>
            );
          })}
          {owners.map((o) => <div key={o.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}><b>{o.name}</b> <span className="muted">· المالك — كل الصلاحيات من غير حد</span></div>)}
        </div>
      )}
      <style>{`@media print { .noprint, nav, aside, header { display: none !important } details { display: block } details > div { display: grid !important } }`}</style>
    </>
  );
}
