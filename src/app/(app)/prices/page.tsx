import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { getMe, can } from "@/lib/perms";
import PriceGrid from "./PriceGrid";
import { copyDirectToApp } from "./actions";

const KIND: Record<string, string> = { raw: "خامة", semi: "نص مصنع" };

export default async function Prices({ searchParams }: { searchParams: Promise<{ ch?: string }> }) {
  const ch = (await searchParams).ch === "app" ? "app" : "direct";
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: items }, { data: all }, { data: locs }, { data: pr }] = await Promise.all([
    sb.from("items").select("id,name,unit,kind").eq("active", true).not("kind", "in", "(pack,mix)").order("name"),
    sb.from("prices").select("item_id,location_id,channel"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    sb.from("prices").select("item_id,location_id,price").eq("channel", ch),
  ]);
  const prices: Record<string, number> = {};
  (pr ?? []).forEach((p) => { prices[`${p.item_id}|${p.location_id}`] = Number(p.price); });
  // أصناف ليها سعر فرع ومالهاش سعر أونلاين في نفس الفرع — مش هتظهر في التطبيق ولا الحجوزات
  const appK = new Set((all ?? []).filter((x) => x.channel === "app").map((x) => `${x.item_id}|${x.location_id}`));
  const missing = new Set((all ?? []).filter((x) => x.channel === "direct" && !appK.has(`${x.item_id}|${x.location_id}`)).map((x) => x.item_id as number));
  const noPrice = (items ?? []).filter((i) => !(all ?? []).some((x) => x.item_id === i.id)).length;
  return (
    <>
      <div className="top"><h1>أسعار البيع في الفروع</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>{[["direct", "سعر الفرع (الكاشير)"], ["app", "سعر الأونلاين"]].map(([k, l]) => <Link key={k} href={`/prices?ch=${k}`} className={ch === k ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>
      {(missing.size > 0 || noPrice > 0) && (
        <div className="card" style={{ borderColor: "var(--y)", marginBottom: 12, display: "grid", gap: 8 }}>
          {missing.size > 0 && <div><b>{missing.size} صنف</b> ليهم سعر فرع ومالهمش سعر أونلاين — مش هيظهروا في التطبيق ولا في الحجوزات لحد ما يتحطلهم سعر أونلاين.</div>}
          {noPrice > 0 && <div><b>{noPrice} صنف</b> مالهمش أي سعر خالص.</div>}
          {missing.size > 0 && can(me, "prices.edit") && <form action={copyDirectToApp}><button className="btn pri">حط سعر الفرع كسعر أونلاين للي ناقص</button></form>}
        </div>
      )}
      <PriceGrid items={(items ?? []).map((i) => ({ id: Number(i.id), name: (i.name as string) + (KIND[i.kind as string] ? ` (${KIND[i.kind as string]})` : ""), unit: i.unit as string }))} locs={locs ?? []} prices={prices} canEdit={can(me, "prices.edit")} channel={ch} key={ch} />
    </>
  );
}
