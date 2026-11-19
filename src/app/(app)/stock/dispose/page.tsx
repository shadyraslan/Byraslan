import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Dispose from "./Dispose";

export default async function DisposePage() {
  const me = await getMe();
  const w = can(me, "stock.waste"), d = can(me, "stock.donate");
  if (!w && !d) redirect("/stock");
  const sb = await supabaseServer();
  const { data: all } = await sb.from("locations").select("id,name").eq("active", true).not("type", "in", "(section,partner,donation)").order("sort");
  const anyLoc = can(me, "stock.waste_any") || !me?.home;
  const locs = (all ?? []).filter((l) => anyLoc || l.id === me?.home);
  const { data: cfg } = await sb.from("settings").select("value").eq("key", "expiry").maybeSingle();
  const wdays = Number((cfg?.value as { waste_days?: number } | null)?.waste_days ?? 1);
  return (
    <>
      <div className="top"><h1>هالك وتبرعات — بالمسح</h1></div>
      {!anyLoc && <div className="muted" style={{ marginBottom: 8 }}>إنت بتهلك أطباق فرعك بس. المسموح: الأطباق اللي صلاحيتها خلصت أو فاضلها {wdays} يوم أو أقل.</div>}
      <Dispose locs={locs} canWaste={w} canDonate={d} wdays={wdays} />
    </>
  );
}
