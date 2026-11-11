import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Labels, { type LI } from "./Labels";

/** طباعة ملصقات الرف والمنتج بالباركود والسعر — واللي سعره اتغيّر من آخر طباعة */
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "prices.edit") && !can(me, "items.edit") && !can(me, "pos.shift")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: locs } = await sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort");
  const loc = sp.loc ?? me?.home ?? locs?.[0]?.id ?? "";
  const [{ data: items }, { data: bcs }, { data: prices }, { data: prints }, { data: fams }] = await Promise.all([
    sb.from("items").select("id,name,unit,size,maker,family_id,sold_by,tags").eq("active", true).order("name"),
    sb.from("item_barcodes").select("code,item_id"),
    sb.from("prices").select("item_id,price").eq("location_id", loc).eq("channel", "direct"),
    sb.from("label_prints").select("item_id,price,at").eq("location_id", loc),
    sb.from("families").select("id,name").order("sort"),
  ]);
  const P = new Map((prices ?? []).map((p) => [p.item_id, Number(p.price)]));
  const LP = new Map<number, { price: number | null; at: string }>((prints ?? []).map((p) => [p.item_id as number, { price: p.price as number | null, at: p.at as string }]));
  const list: LI[] = (items ?? []).filter((i) => !(i.tags ?? []).includes("unknown")).map((i) => {
    const codes = (bcs ?? []).filter((b) => b.item_id === i.id).map((b) => b.code as string);
    const lp = LP.get(i.id);
    return { id: i.id, name: i.name, unit: i.unit, size: i.size, maker: i.maker, family: i.family_id, code: codes.find((c) => !c.startsWith("20")) ?? codes[0] ?? null,
      internal: codes.some((c) => /^20\d{11}$/.test(c)), price: P.get(i.id) ?? null, last: lp ? Number(lp.price) : null, printed: lp?.at ?? null };
  }).filter((i) => i.price != null);
  return <Labels items={list} locs={locs ?? []} loc={loc} fams={fams ?? []} />;
}
