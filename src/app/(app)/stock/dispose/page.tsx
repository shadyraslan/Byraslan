import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Dispose from "./Dispose";

export default async function DisposePage() {
  const me = await getMe();
  const w = can(me, "stock.waste"), d = can(me, "stock.donate");
  if (!w && !d) redirect("/stock");
  const sb = await supabaseServer();
  const { data: locs } = await sb.from("locations").select("id,name").eq("active", true).not("type", "in", "(section,partner,donation)").order("sort");
  return (
    <>
      <div className="top"><h1>هالك وتبرعات — بالمسح</h1></div>
      <Dispose locs={locs ?? []} canWaste={w} canDonate={d} />
    </>
  );
}
