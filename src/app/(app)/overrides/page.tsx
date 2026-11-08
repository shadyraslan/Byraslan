import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../purchasing/Tabs";
import { decideOverride } from "../purchasing/actions";

const ST: Record<string, [string, string]> = { pending: ["مستني", "#b7791f"], approved: ["متوافق عليه", "var(--good)"], rejected: ["مرفوض", "var(--bad)"], used: ["اتنفّذ", "var(--muted)"] };

export default async function Overrides() {
  const me = await getMe();
  if (!can(me, "override.recv")) redirect("/dashboard");
  const canDecide = can(me, "override.recv");
  const sb = await supabaseServer();
  const [{ data: rows }, { data: people }] = await Promise.all([
    sb.from("override_requests").select("*").order("id", { ascending: false }).limit(100),
    sb.from("profiles").select("id,name"),
  ]);
  const N = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const R = rows ?? [];
  const pend = R.filter((r) => r.status === "pending");
  const Item = ({ r }: { r: (typeof R)[number] }) => (
    <div className="card" style={{ borderInlineStart: `4px solid ${ST[r.status]?.[1]}` }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>#{r.id} · {r.ref} · <span className="num">{Number(r.value).toLocaleString("en-US")} ج</span></b>
        <span style={{ color: ST[r.status]?.[1] }}>{ST[r.status]?.[0]}</span>
      </div>
      {((r.violations ?? []) as (string | { t: string })[]).map((v, i) => <div key={i} style={{ fontSize: 13.5 }}>• {typeof v === "string" ? v : v.t}</div>)}
      <div style={{ marginTop: 6 }}>السبب: {r.reason}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>{N.get(r.requested_by)} · {new Date(r.requested_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}
        {r.decided_by && <> — قرار {N.get(r.decided_by)}: {r.decision_note}</>}</div>
      {r.status === "pending" && canDecide && (
        <form action={decideOverride} className="row" style={{ marginTop: 8 }}>
          <input type="hidden" name="id" value={r.id} />
          <input name="note" placeholder="ملاحظتك" required minLength={3} style={{ flex: "1 1 200px" }} />
          <button name="approve" value="1" className="btn pri">وافق</button>
          <button name="approve" value="0" className="btn">ارفض</button>
        </form>
      )}
    </div>
  );
  return (
    <>
      <div className="top"><h1>التجاوزات</h1></div>
      <Tabs cur="/overrides" />
      <h2>مستنية قرار ({pend.length})</h2>
      {pend.map((r) => <Item key={r.id} r={r} />)}
      {!pend.length && <div className="card muted">مفيش طلبات مستنية</div>}
      <h2 style={{ marginTop: 16 }}>السجل</h2>
      {R.filter((r) => r.status !== "pending").map((r) => <Item key={r.id} r={r} />)}
    </>
  );
}
