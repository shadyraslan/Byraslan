import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { BRANCH_APPS, LOC_ICON, LOC_TYPE } from "@/lib/apps";
import Tile from "@/components/Tile";
import Icon from "@/components/Icon";
import Bars from "@/components/Bars";
import { money } from "@/lib/time";

export default async function Branch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const sb = await supabaseServer();
  const { data: loc } = await sb.from("locations").select("id,name,type,city").eq("id", id).maybeSingle();
  if (!loc) notFound();
  const { data: subs } = await sb.from("locations").select("id,name,type").eq("parent", id).eq("active", true).order("sort");
  const isShop = ["dark", "shop"].includes(loc.type);
  // أرقام الفرع: مبيعات آخر 14 يوم + الطلبات المفتوحة
  const since = new Date(Date.now() - 13 * 86400000); since.setHours(0, 0, 0, 0);
  const seeSales = can(me, "acc.view") || can(me, "pos.shift");
  const [{ data: sl }, { count: openOrders }] = await Promise.all([
    isShop && seeSales ? sb.from("sales").select("at,total").eq("location_id", id).gte("at", since.toISOString()) : Promise.resolve({ data: [] as { at: string; total: number }[] }),
    isShop && can(me, "orders.handle") ? sb.from("online_orders").select("id", { count: "exact", head: true }).eq("location_id", id).in("status", ["new", "accepted", "preparing", "ready", "out"]) : Promise.resolve({ count: null }),
  ]);
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
  const days = Array.from({ length: 14 }, (_, i) => day(new Date(since.getTime() + i * 86400000 + 12 * 3600000)));
  const byDay = new Map<string, number>();
  for (const x of sl ?? []) { const k = day(new Date(x.at as string)); byDay.set(k, (byDay.get(k) ?? 0) + Number(x.total)); }
  const series = days.map((d) => ({ label: new Date(`${d}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" }), v: byDay.get(d) ?? 0 }));
  const todaySales = byDay.get(day(new Date())) ?? 0;
  const apps = BRANCH_APPS.filter((a) => !!a.href && (!a.perm || can(me, a.perm)) && (isShop || !["pos", "orders", "partner", "receive"].includes(a.id)));
  return (
    <>
      <div className="crumbs"><Link href="/dashboard">الرئيسية</Link> ‹ <span>{loc.name}</span></div>
      <div className="top">
        <h1 style={{ display: "flex", gap: 10, alignItems: "center" }}><span className="hico"><Icon name={LOC_ICON[loc.type]} /></span>{loc.name}</h1>
        <span className="pill">{LOC_TYPE[loc.type]}{loc.city ? " · " + loc.city : ""}</span>
      </div>
      {isShop && (seeSales || openOrders != null) && (
        <div className="kpis">
          {seeSales && <div className="kpi hl"><span>مبيعات النهارده</span><b className="num">{money(todaySales)} ج</b></div>}
          {seeSales && <div className="kpi"><span>آخر 14 يوم</span><b className="num">{money(series.reduce((a, x) => a + x.v, 0))} ج</b></div>}
          {openOrders != null && <Link href="/orders" className={`kpi${openOrders ? " hl" : ""}`}><span>طلبات أونلاين مفتوحة</span><b className="num">{openOrders}</b></Link>}
        </div>
      )}
      <div className="tiles">
        {apps.map((a) => <Tile key={a.id} href={a.href ? (a.id === "stock" ? `${a.href}?loc=${loc.id}` : a.href) : `/soon?m=${a.id}&b=${loc.id}`} icon={a.icon} color={a.color} label={a.label} soon={!a.href} />)}
      </div>
      {isShop && seeSales && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>مبيعات {loc.name} في آخر 14 يوم</h2>
          <Bars data={series} unit=" ج" />
        </div>
      )}
      {!!subs?.length && (
        <>
          <h2 className="sec">تابع لـ {loc.name}</h2>
          <div className="tiles">{subs.map((s) => <Tile key={s.id} href={`/branches/${s.id}`} icon={LOC_ICON[s.type]} color="#0d0d0d" label={s.name} sub={LOC_TYPE[s.type]} />)}</div>
        </>
      )}
    </>
  );
}
