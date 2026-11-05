import { redirect } from "next/navigation";
import { getMe, can } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import PackStation, { type Ready } from "./PackStation";

export default async function Pack() {
  const me = await getMe();
  if (!can(me, "prod.pack")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.from("pack_ready").select("id,no,item_name,qty,boxes").order("no");
  const ready = ((data ?? []) as unknown as Ready[]).map((o) => ({ ...o, id: Number(o.id), no: Number(o.no), qty: Number(o.qty), boxes: Number(o.boxes) }));
  return (
    <>
      <div className="top noprint"><h1>محطة التغليف</h1><span className="pill">الميزان ← علبة برقم ← QR</span></div>
      <PackStation ready={ready} />
    </>
  );
}
