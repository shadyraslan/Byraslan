import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import NewTransfer from "./NewTransfer";

export default async function NewTransferPage() {
  const me = await getMe();
  if (!can(me, "stock.edit")) redirect("/transfers");
  const sb = await supabaseServer();
  const { data: locs } = await sb.from("locations").select("id,name").eq("active", true).not("type", "in", "(section,partner)").order("sort");
  return (
    <>
      <div className="top"><h1>تحويل جديد — بالمسح</h1></div>
      <NewTransfer locs={locs ?? []} />
    </>
  );
}
