import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Refresh from "@/app/t/[token]/Refresh";

type O = { id: number; no: number; status: string; created_at: string; est_total: number; total: number | null; delivery_fee: number; location_id: string; pay_method: string; channel: string; driver: string | null; customers: { name: string; area: string | null } | null; online_order_lines: { qty: number }[] };
const COLS: [string, string[]][] = [["جديد", ["new"]], ["بيتحضّر", ["accepted", "preparing"]], ["جاهز", ["ready"]], ["مع الطيار", ["out"]]];
const PAY: Record<string, string> = { cash: "كاش", card: "فيزا", instapay: "إنستاباي" };

export default async function Orders({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const me = await getMe();
  if (!can(me, "orders.handle") && !can(me, "acc.view")) redirect("/dashboard");
  const sp = await searchParams;
  const loc = sp.loc ?? me?.home ?? "all";
  const sb = await supabaseServer();
  let q = sb.from("online_orders").select("id,no,status,created_at,est_total,total,delivery_fee,location_id,pay_method,channel,driver,customers(name,area),online_order_lines(qty)").not("status", "in", "(delivered,cancelled)").order("id");
  if (loc !== "all") q = q.eq("location_id", loc);
  const [{ data }, { data: locs }, { data: late }, { data: today }] = await Promise.all([
    q,
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
    sb.from("settings").select("value").eq("key", "online.late_minutes").maybeSingle(),
    sb.from("online_orders").select("id,total,status").gte("created_at", new Date(Date.now() - 864e5).toISOString()).in("status", ["delivered", "cancelled"]),
  ]);
  const lateMin = Number(late?.value ?? 45);
  const R = (data ?? []) as unknown as O[];
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const now = Date.now();
  return (
    <>
      <Refresh every={15000} />
      <div className="top"><h1>طلبات الأونلاين {R.filter((o) => o.status === "new").length ? `· ${R.filter((o) => o.status === "new").length} جديد` : ""}</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>
        {[["all", "كل الفروع"], ...(locs ?? []).map((l) => [l.id as string, l.name as string])].map(([id, n]) => <Link key={id} href={`/orders?loc=${id}`} className={loc === id ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{n}</Link>)}
        <Link href="/order?ch=phone" target="_blank" className="btn" style={{ display: "inline-grid", placeItems: "center", marginInlineStart: "auto" }}>+ طلب تليفون</Link>
      </div>
      <div className="board">
        {COLS.map(([title, sts]) => {
          const L = R.filter((o) => sts.includes(o.status));
          return (
            <div key={title} className="col">
              <b>{title} ({L.length})</b>
              {L.map((o) => {
                const mins = Math.round((now - new Date(o.created_at).getTime()) / 60000);
                return (
                  <Link key={o.id} href={`/orders/${o.id}`} className={`ocard${mins > lateMin && o.status !== "out" ? " late" : ""}`}>
                    <div className="row" style={{ justifyContent: "space-between" }}><b className="num">#{o.no}</b><span className="num muted">{mins} د</span></div>
                    <div>{o.customers?.name} <span className="muted">{o.customers?.area}</span></div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{loc === "all" && `${LN.get(o.location_id)} · `}{o.online_order_lines.length} صنف · {PAY[o.pay_method]} · <span className="num">{Math.round(Number(o.est_total) + Number(o.delivery_fee))}</span>{o.channel !== "web" ? ` · ${o.channel === "phone" ? "تليفون" : "واتساب"}` : ""}{o.driver ? ` · ${o.driver}` : ""}</div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>آخر 24 ساعة: {(today ?? []).filter((o) => o.status === "delivered").length} اتسلّم · {(today ?? []).filter((o) => o.status === "cancelled").length} اتلغى · الصفحة بتتحدّث لوحدها كل 15 ثانية · الطلب بيبقى أحمر بعد {lateMin} دقيقة</div>
    </>
  );
}
