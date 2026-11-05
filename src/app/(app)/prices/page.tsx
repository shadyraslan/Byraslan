import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { getMe, can } from "@/lib/perms";
import PriceGrid from "./PriceGrid";

export default async function Prices({ searchParams }: { searchParams: Promise<{ ch?: string }> }) {
  const ch = (await searchParams).ch === "app" ? "app" : "direct";
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: items }, { data: locs }, { data: pr }] = await Promise.all([
    sb.from("items").select("id,name,unit").eq("active", true).eq("kind", "product").order("name"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    sb.from("prices").select("item_id,location_id,price").eq("channel", ch),
  ]);
  const prices: Record<string, number> = {};
  (pr ?? []).forEach((p) => { prices[`${p.item_id}|${p.location_id}`] = Number(p.price); });
  return (
    <>
      <div className="top"><h1>أسعار البيع في الفروع</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>{[["direct", "سعر الفرع (الكاشير)"], ["app", "سعر الأونلاين"]].map(([k, l]) => <Link key={k} href={`/prices?ch=${k}`} className={ch === k ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>
      <PriceGrid items={(items ?? []).map((i) => ({ id: Number(i.id), name: i.name as string, unit: i.unit as string }))} locs={locs ?? []} prices={prices} canEdit={can(me, "prices.edit")} channel={ch} key={ch} />
    </>
  );
}
