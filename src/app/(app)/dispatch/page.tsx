import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import MarketDispatch from "./MarketDispatch";

export default async function DispatchPage() {
  const me = await getMe();
  if (!can(me, "orders.dispatch") && !can(me, "orders.handle")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: locs } = await sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort");
  return <MarketDispatch locs={locs ?? []} home={me?.home ?? null} />;
}
