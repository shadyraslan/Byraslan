import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { MODULES, LOC_ICON, LOC_TYPE } from "@/lib/apps";
import Link from "next/link";
import Tile from "@/components/Tile";
import { cairoDayStart, money } from "@/lib/time";

export default async function Home() {
  const me = await getMe();
  const sb = await supabaseServer();
  const start = cairoDayStart();
  const [{ data: locs }, { data: sales }, { count: packed }, { count: transit }, { count: prod }] = await Promise.all([
    sb.from("locations").select("id,name,type,city,active").eq("active", true).order("sort"),
    sb.from("sales").select("location_id,total").gte("at", start),
    sb.from("boxes").select("sn", { count: "exact", head: true }).gte("packed_at", start),
    sb.from("transfers").select("id", { count: "exact", head: true }).eq("status", "transit"),
    sb.from("prod_orders").select("id", { count: "exact", head: true }).in("status", ["planned", "running"]),
  ]);
  const byLoc: Record<string, { t: number; n: number }> = {};
  (sales ?? []).forEach((x) => { const k = x.location_id as string; (byLoc[k] ??= { t: 0, n: 0 }).t += Number(x.total); byLoc[k].n++; });
  const totalSales = Object.values(byLoc).reduce((a, x) => a + x.t, 0);
  const nSales = Object.values(byLoc).reduce((a, x) => a + x.n, 0);
  const seeSales = can(me, "acc.view") || can(me, "pos.shift");
  const branches = (locs ?? []).filter((l) => ["dark", "shop"].includes(l.type));
  const sites = (locs ?? []).filter((l) => ["factory", "warehouse", "donation"].includes(l.type));
  const mods = MODULES.filter((m) => !m.perm || can(me, m.perm));
  return (
    <>
      <div className="top"><h1>أهلاً {me?.name}</h1></div>
      <div className="kpis">
        {seeSales && <Link href="/sales" className="kpi hl"><span>مبيعات النهارده</span><b className="num">{money(totalSales)} ج</b><small>{nSales} فاتورة</small></Link>}
        {can(me, "prod.pack") && <Link href="/pack" className="kpi"><span>علب اتغلّفت النهارده</span><b className="num">{packed ?? 0}</b></Link>}
        {can(me, "stock.view") && <Link href="/transfers" className="kpi"><span>تحويلات في الطريق</span><b className="num">{transit ?? 0}</b></Link>}
        {can(me, "prod.orders") && <Link href="/production" className="kpi"><span>أوامر إنتاج مفتوحة</span><b className="num">{prod ?? 0}</b></Link>}
      </div>

      <h2 className="sec">الفروع</h2>
      <div className="tiles">
        {branches.map((b) => <Tile key={b.id} href={`/branches/${b.id}`} icon={LOC_ICON[b.type]} color="#f5c800" label={b.name} sub={`${LOC_TYPE[b.type]}${b.city ? " · " + b.city : ""}${seeSales && byLoc[b.id] ? ` · ${money(byLoc[b.id].t)} ج النهارده` : ""}`} />)}
        {sites.map((b) => <Tile key={b.id} href={`/branches/${b.id}`} icon={LOC_ICON[b.type]} color="#0d0d0d" label={b.name} sub={LOC_TYPE[b.type]} />)}
        {!branches.length && !sites.length && <div className="note">مفيش فروع لسه — ضيفها من المواقع والفروع</div>}
      </div>

      <h2 className="sec">الأقسام</h2>
      <div className="tiles">
        {mods.map((m) => <Tile key={m.id} href={m.href ?? `/soon?m=${m.id}`} icon={m.icon} color={m.color} label={m.label} soon={!m.href} />)}
      </div>
    </>
  );
}
