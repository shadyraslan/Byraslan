import { redirect } from "next/navigation";
import { getMe, can } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import PackStation, { type Ready } from "./PackStation";

export default async function Pack() {
  const me = await getMe();
  if (!can(me, "prod.pack")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.from("pack_ready").select("id,no,item_name,qty,boxes,from_room,room_name,packed_weight,avg_box,unit").order("no");
  const ready = ((data ?? []) as unknown as Ready[]).map((o) => ({ ...o, id: Number(o.id), no: Number(o.no), qty: Number(o.qty), boxes: Number(o.boxes), from_room: o.from_room == null ? null : Number(o.from_room), packed_weight: Number(o.packed_weight ?? 0), avg_box: o.avg_box == null ? null : Number(o.avg_box) }));
  return (
    <>
      <div className="top noprint"><h1>محطة التغليف</h1><span className="pill">الميزان ← علبة برقم ← QR</span></div>
      <PackStation ready={ready} />
    </>
  );
}
