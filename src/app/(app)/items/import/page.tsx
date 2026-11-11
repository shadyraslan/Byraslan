import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Importer from "./Importer";

export default async function ItemsImport() {
  const me = await getMe();
  if (!can(me, "items.edit")) redirect("/items");
  const sb = await supabaseServer();
  const [{ data: items }, { data: fams }, { data: bcs }, { data: prices }, { data: locs }] = await Promise.all([
    sb.from("items").select("id,code,name,arm,unit,sold_by,kind,scale_plu,cost,shelf_days,active,family_id,tags,maker,size,reorder_min").order("id"),
    sb.from("families").select("id,name,parent_id"),
    sb.from("item_barcodes").select("code,item_id"),
    sb.from("prices").select("item_id,location_id,channel,price"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
  ]);
  const F = new Map<number, { id: number; name: string; parent_id: number | null }>((fams ?? []).map((f) => [f.id as number, f as { id: number; name: string; parent_id: number | null }]));
  const rows = (items ?? []).filter((i) => !((i.tags as string[] | null) ?? []).includes("demo")).map((i) => {
    const f = i.family_id ? F.get(i.family_id as number) : undefined;
    const g = f?.parent_id ? F.get(f.parent_id) : undefined;
    const pr: Record<string, Record<string, number>> = {};
    for (const p of (prices ?? []).filter((p) => p.item_id === i.id)) (pr[p.location_id as string] ??= {})[p.channel as string] = Number(p.price);
    return {
      code: i.code as string | null, name: i.name as string, arm: i.arm as string, unit: i.unit as string | null, sold_by: i.sold_by as string | null, kind: i.kind as string | null,
      scale_plu: i.scale_plu as string | null, cost: i.cost as number | null, shelf_days: i.shelf_days as number | null, active: !!i.active,
      family: g ? (f?.name ?? null) : (f?.name ?? null), group: g?.name ?? null,
      barcodes: (bcs ?? []).filter((b) => b.item_id === i.id).map((b) => b.code as string).join(", "), prices: pr, maker: i.maker ?? null, size: i.size ?? null, reorder_min: i.reorder_min ?? null,
    };
  });
  return (
    <>
      <div className="top"><h1>رفع الأصناف والأسعار من ملف</h1></div>
      <Importer items={rows} locs={(locs ?? []) as { id: string; name: string }[]} />
    </>
  );
}
