import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Dispatch from "./Dispatch";
import MarketDispatch from "../../dispatch/MarketDispatch";

/** الديسباتشر: شخص واحد واقف في السوبر ماركت بيجهّز الطلبات — أصناف الماركت الشريك + أصناف السوبر ماركت اللي في طلبات الفروع، في صفحة واحدة */
export default async function DispatchPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const me = await getMe();
  const partner = can(me, "partner.dispatch") || can(me, "partner.manage");
  const market = can(me, "orders.dispatch") || can(me, "orders.handle");
  if (!partner && !market) redirect("/dashboard");
  const tab = t === "market" || !partner ? "market" : "partner";
  const sb = await supabaseServer();
  const [{ data: plocs }, { data: blocs }] = await Promise.all([
    sb.from("locations").select("id,name").eq("type", "partner").eq("active", true).order("name"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
  ]);
  return (
    <>
      {partner && market && (
        <div className="row" style={{ marginBottom: 10 }}>
          <Link className={`btn${tab === "partner" ? " pri" : ""}`} href="/partner/dispatch">طلبات الماركت (أصناف الشريك)</Link>
          <Link className={`btn${tab === "market" ? " pri" : ""}`} href="/partner/dispatch?t=market">أصناف السوبر ماركت في طلبات الفروع</Link>
        </div>
      )}
      {tab === "partner" ? <Dispatch locs={plocs ?? []} home={me?.home ?? null} /> : <MarketDispatch locs={blocs ?? []} home={me?.home ?? null} />}
    </>
  );
}
