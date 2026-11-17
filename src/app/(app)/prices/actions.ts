"use server";
import { deny } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export async function savePrice(item: number, loc: string, price: string, channel: "direct" | "app" = "direct"): Promise<Result<{ v: number | null }>> {
  { const g = await deny("prices.edit"); if (g) return g; }
  const sb = await supabaseServer();
  const v = price.trim() === "" ? null : Number(price);
  if (v !== null && (!Number.isFinite(v) || v < 0)) return { ok: false, error: "السعر لازم رقم" };
  if (v === null) return { ok: true, v: null };
  const { error } = await sb.from("prices").upsert({ item_id: item, location_id: loc, channel, price: v });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, v };
}

// كل صنف ليه سعر فرع ومالوش سعر أونلاين في نفس الفرع: ياخد سعر الفرع (عشان يظهر في التطبيق والحجوزات)
export async function copyDirectToApp(): Promise<void> {
  { const g = await deny("prices.edit"); if (g) return; }
  const sb = await supabaseServer();
  const [{ data: d }, { data: a }] = await Promise.all([
    sb.from("prices").select("item_id,location_id,price").eq("channel", "direct"),
    sb.from("prices").select("item_id,location_id").eq("channel", "app"),
  ]);
  const has = new Set((a ?? []).map((x) => `${x.item_id}|${x.location_id}`));
  const rows = (d ?? []).filter((x) => !has.has(`${x.item_id}|${x.location_id}`)).map((x) => ({ item_id: x.item_id, location_id: x.location_id, channel: "app", price: x.price }));
  if (rows.length) await sb.from("prices").upsert(rows);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/prices");
}
