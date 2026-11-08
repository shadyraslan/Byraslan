import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import CrateLabels from "./CrateLabels";

export default async function Crates() {
  const me = await getMe();
  if (!can(me, "stock.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.from("crates").select("id").eq("active", true).order("id");
  return (
    <>
      <div className="top noprint"><h1>ملصقات الصناديق البلاستيك</h1></div>
      <CrateLabels ids={(data ?? []).map((c) => c.id as string)} />
    </>
  );
}
