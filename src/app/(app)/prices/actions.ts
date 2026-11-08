"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { dbMsg, type Result } from "@/lib/scan";

export async function savePrice(item: number, loc: string, price: string, channel: "direct" | "app" = "direct"): Promise<Result<{ v: number | null }>> {
  const me = await getMe();
  if (!can(me, "prices.edit")) throw new Error("ليس لديك صلاحية تعديل الأسعار");
  const sb = await supabaseServer();
  const v = price.trim() === "" ? null : Number(price);
  if (v !== null && (!Number.isFinite(v) || v < 0)) return { ok: false, error: "السعر لازم رقم" };
  if (v === null) return { ok: true, v: null };
  const { error } = await sb.from("prices").upsert({ item_id: item, location_id: loc, channel, price: v });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, v };
}
