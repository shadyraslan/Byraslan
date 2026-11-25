"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { need } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";

export async function saveMins(fd: FormData) {
  await need("stock.min");
  const sb = await supabaseServer();
  const item = Number(fd.get("item"));
  const num = (v: FormDataEntryValue | null) => { const t = String(v ?? "").trim(); return t === "" ? null : Number(t); };
  const locs = [...new Set([...fd.keys()].filter((k) => k.startsWith("min:")).map((k) => k.slice(4)))];
  // الخانة الفاضية = مفيش حد أدنى (صفر) / مفيش إنتاج أوتوماتيك
  const up = locs.map((loc) => { const mn = num(fd.get(`min:${loc}`)); const mk = num(fd.get(`make:${loc}`));
    return { item_id: item, location_id: loc, min_qty: mn != null && mn >= 0 ? mn : 0, make_qty: mk != null && mk > 0 ? mk : null, updated_at: new Date().toISOString() }; });
  if (up.length) { const { error } = await sb.from("stock_min").upsert(up); if (error) redirect(`/items/${item}?err=${encodeURIComponent(error.message)}`); }
  revalidatePath(`/items/${item}`);
  redirect(`/items/${item}?ok=1`);
}
export async function setPhoto(item: number, url: string) {
  await need("items.edit");
  const sb = await supabaseServer();
  await sb.from("items").update({ photo: url }).eq("id", item);
  revalidatePath(`/items/${item}`);
}

/** رصيد صنف السوبر ماركت يتعدل من السيستم (من غير الشيت) — الأصناف اللي بالأطباق رصيدها بالأطباق بس */
export async function setStock(fd: FormData) {
  await need("stock.adjust");
  const sb = await supabaseServer();
  const item = Number(fd.get("item"));
  const { data, error } = await sb.rpc("stock_set", { p_item: item, p_loc: String(fd.get("loc")), p_qty: Number(fd.get("qty")), p_reason: String(fd.get("reason") || "") });
  if (error) redirect(`/items/${item}?err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}`);
  revalidatePath(`/items/${item}`);
  revalidatePath("/stock");
  redirect(`/items/${item}?ok=${encodeURIComponent(`اتعدل الرصيد (${Number(data) >= 0 ? "+" : ""}${Number(data)})`)}`);
}

/** حد إعادة الطلب من المورد لصنف السوبر ماركت (على مستوى الصنف — نفس عمود الشيت) */
export async function saveReorder(fd: FormData) {
  await need("purchase.edit");
  const sb = await supabaseServer();
  const item = Number(fd.get("item"));
  const n = (k: string) => { const v = String(fd.get(k) ?? "").trim(); return v === "" ? null : Math.max(Number(v) || 0, 0); };
  const { error } = await sb.from("items").update({ reorder_min: n("reorder_min"), reorder_qty: n("reorder_qty") }).eq("id", item);
  if (error) redirect(`/items/${item}?err=${encodeURIComponent(error.message)}`);
  revalidatePath(`/items/${item}`);
  redirect(`/items/${item}?ok=1`);
}
