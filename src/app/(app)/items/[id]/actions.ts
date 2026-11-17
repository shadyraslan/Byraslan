"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { need } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";

export async function saveMins(fd: FormData) {
  await need("stock.min");
  const sb = await supabaseServer();
  const item = Number(fd.get("item"));
  const rows = [...fd.entries()].filter(([k]) => k.startsWith("min:")).map(([k, v]) => ({ item_id: item, location_id: k.slice(4), v: String(v).trim() }));
  const up = rows.filter((r) => r.v !== "" && Number(r.v) >= 0).map((r) => ({ item_id: r.item_id, location_id: r.location_id, min_qty: Number(r.v), updated_at: new Date().toISOString() }));
  if (up.length) await sb.from("stock_min").upsert(up);
  // الخانة الفاضية = مفيش حد أدنى (صفر)
  const off = rows.filter((r) => r.v === "").map((r) => ({ item_id: r.item_id, location_id: r.location_id, min_qty: 0, updated_at: new Date().toISOString() }));
  if (off.length) await sb.from("stock_min").upsert(off);
  revalidatePath(`/items/${item}`);
  redirect(`/items/${item}?ok=1`);
}
export async function setPhoto(item: number, url: string) {
  await need("items.edit");
  const sb = await supabaseServer();
  await sb.from("items").update({ photo: url }).eq("id", item);
  revalidatePath(`/items/${item}`);
}
