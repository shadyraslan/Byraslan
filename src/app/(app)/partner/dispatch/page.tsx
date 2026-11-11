import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Dispatch from "./Dispatch";

export default async function DispatchPage() {
  const me = await getMe();
  if (!can(me, "partner.dispatch") && !can(me, "partner.manage")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: locs } = await sb.from("locations").select("id,name").eq("type", "partner").eq("active", true).order("name");
  return <Dispatch locs={locs ?? []} home={me?.home ?? null} />;
}
