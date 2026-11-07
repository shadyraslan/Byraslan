import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Counter, { type CountView } from "./Counter";

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!can(me, "stock.count") && !can(me, "stock.adjust") && !can(me, "stock.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("count_view", { p_count: Number(id) });
  if (error || !data) notFound();
  const v = data as CountView;
  // الأصناف اللي ممكن تتضاف للجرد (بالكمية، مش علب)
  const { data: items } = v.status === "open"
    ? await sb.from("items").select("id,name,unit,arm,kind,family_id").eq("active", true).order("name")
    : { data: [] };
  const extra = (items ?? []).filter((i) => !(i.arm === "rostos" && i.kind === "product") && !v.lines.some((l) => l.item_id === i.id)).map((i) => ({ id: i.id, name: i.name, unit: i.unit }));
  return <Counter v={v} extra={extra} canCount={can(me, "stock.count") || can(me, "stock.adjust")} />;
}
