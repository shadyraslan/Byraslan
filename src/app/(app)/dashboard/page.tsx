import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { LOC_ICON, LOC_TYPE } from "@/lib/apps";
import { NAV } from "@/lib/nav";
import Tile from "@/components/Tile";
import Bars from "@/components/Bars";
import { cairoDayStart, money } from "@/lib/time";

/** الرئيسية: اللي محتاج منك دلوقتي، الفروع، وكل الأقسام بنفس ترتيب القايمة الجانبية */
export default async function Home() {
  const me = await getMe();
  const sb = await supabaseServer();
  const start = cairoDayStart();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());
  const c = (q: PromiseLike<{ count: number | null }>, ok: boolean) => (ok ? q : Promise.resolve({ count: null }));
  const [{ data: locs }, { data: sales }, orders, books, tickets, exps, leaves, runs] = await Promise.all([
    sb.from("locations").select("id,name,type,city,active").eq("active", true).order("sort"),
    can(me, "acc.view") || can(me, "pos.shift") ? sb.from("sales").select("location_id,total").gte("at", start) : Promise.resolve({ data: [] as { location_id: string; total: number }[] }),
    c(sb.from("online_orders").select("id", { count: "exact", head: true }).in("status", ["new", "accepted", "preparing", "ready", "out"]).or(`is_booking.eq.false,release_at.lte.${new Date().toISOString()}`), can(me, "orders.handle")),
    c(sb.from("v_bookings").select("id", { count: "exact", head: true }).eq("day", today).neq("status", "cancelled"), can(me, "orders.handle") || can(me, "orders.booking") || can(me, "cs.agent")),
    c(sb.from("support_tickets").select("id", { count: "exact", head: true }).in("status", ["new", "open"]).eq("last_from", "customer"), can(me, "cs.agent") || can(me, "cs.manage")),
    c(sb.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending"), can(me, "acc.approve")),
    c(sb.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending"), can(me, "hr.leaves")),
    c(sb.from("payroll_runs").select("id", { count: "exact", head: true }).eq("status", "sent"), can(me, "hr.pay")),
  ]);
  const byLoc: Record<string, { t: number; n: number }> = {};
  (sales ?? []).forEach((x) => { const k = x.location_id as string; (byLoc[k] ??= { t: 0, n: 0 }).t += Number(x.total); byLoc[k].n++; });
  const totalSales = Object.values(byLoc).reduce((a, x) => a + x.t, 0);
  const nSales = Object.values(byLoc).reduce((a, x) => a + x.n, 0);
  const seeSales = can(me, "acc.view") || can(me, "pos.shift");
  const branches = (locs ?? []).filter((l) => ["dark", "shop"].includes(l.type));
  const sites = (locs ?? []).filter((l) => ["factory", "warehouse", "donation"].includes(l.type));
  const st = seeSales ? ((await sb.rpc("section_stats", { p_section: "branches" })).data as { series?: { d: string; v: number }[] } | null) : null;
  const salesSeries = (st?.series ?? []).map((x) => ({ label: new Date(`${x.d}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" }), v: Number(x.v) }));
  const groups = NAV.map((g) => ({ ...g, links: g.links.filter((l) => !l.perms || l.perms.some((p) => can(me, p))) })).filter((g) => g.links.length);
  const K = ({ href, label, n, warn, sub }: { href: string; label: string; n: number | null | string; warn?: boolean; sub?: string }) =>
    n == null ? null : <Link href={href} className={`kpi${warn && Number(n) > 0 ? " hl" : ""}`}><span>{label}</span><b className="num">{n}</b>{sub && <small>{sub}</small>}</Link>;
  return (
    <>
      <div className="top"><h1>أهلاً {me?.name} 👋</h1></div>
      <div className="kpis">
        {seeSales && <K href="/sales" label="مبيعات النهارده" n={`${money(totalSales)} ج`} sub={`${nSales} فاتورة`} />}
        <K href="/orders" label="طلبات أونلاين مفتوحة" n={orders.count} warn />
        <K href="/bookings" label="حجوزات النهارده" n={books.count} />
        <K href="/cs" label="عملاء مستنيين رد" n={tickets.count} warn />
        <K href="/accounts/expenses" label="مصروفات مستنية موافقتك" n={exps.count} warn />
        <K href="/hr/leaves" label="إجازات وسلف مستنية" n={leaves.count} warn />
        <K href="/hr/payroll" label="مرتبات مستنية الاعتماد" n={runs.count} warn />
      </div>

      {!!(branches.length + sites.length) && (
        <>
          <h2 className="sec">الفروع والمصنع</h2>
          <div className="tiles">
            {branches.map((b) => <Tile key={b.id} href={`/branches/${b.id}`} icon={LOC_ICON[b.type]} color="#f5c800" label={b.name} sub={`${LOC_TYPE[b.type]}${seeSales && byLoc[b.id] ? ` · ${money(byLoc[b.id].t)} ج النهارده` : ""}`} />)}
            {sites.map((b) => <Tile key={b.id} href={`/branches/${b.id}`} icon={LOC_ICON[b.type]} color="#0d0d0d" label={b.name} sub={LOC_TYPE[b.type]} />)}
          </div>
        </>
      )}

      <h2 className="sec">الأقسام</h2>
      <div className="tiles">
        {groups.map((g) => <Tile key={g.id} href={`/sec/${g.id}`} icon={g.icon} color={g.color} label={g.title} sub={`${g.links.length} شاشة`} />)}
      </div>

      {seeSales && !!salesSeries.length && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>مبيعات الفروع في آخر 14 يوم</h2>
          <Bars data={salesSeries} unit=" ج" />
        </div>
      )}
    </>
  );
}
