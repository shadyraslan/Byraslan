"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");
const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const N = (fd: FormData, k: string) => Number(S(fd, k) || 0);
async function done(back: string, error: { message?: string } | null, ok: string): Promise<never> {
  revalidatePath(back.split("?")[0]);
  const sep = back.includes("?") ? "&" : "?";
  redirect(error ? `${back}${sep}err=${encodeURIComponent(msg(error))}` : `${back}${sep}ok=${encodeURIComponent(ok)}`);
}

export async function savePartner(fd: FormData) {
  await need("partner.manage");
  const sb = await supabaseServer();
  const row = { name: S(fd, "name"), phone: S(fd, "phone") || null, discount_pct: N(fd, "pct"), settle_cycle: S(fd, "cycle") || "weekly", due_days: N(fd, "due") || 7, unit: S(fd, "unit") || "piece",
    file_map: { code: S(fd, "m_code"), barcode: S(fd, "m_barcode"), name: S(fd, "m_name"), qty: S(fd, "m_qty"), price: S(fd, "m_price") } };
  const id = N(fd, "id");
  const { error } = id ? await sb.from("partners").update(row).eq("id", id) : await sb.from("partners").insert(row);
  await done("/partner", error, "اتحفظ الشريك");
}
export async function addPartnerBranch(fd: FormData) {
  await need("partner.manage");
  const sb = await supabaseServer();
  const id = `p-${Date.now().toString(36)}`;
  const { error } = await sb.from("locations").insert({ id, name: S(fd, "name"), type: "partner", active: true, city: S(fd, "city") || null });
  if (error) await done("/partner", error, "");
  const { error: e2 } = await sb.from("partner_branches").insert({ location_id: id, partner_id: N(fd, "partner"), branch_id: S(fd, "branch") || null, near: S(fd, "near") !== "far" });
  await done("/partner", e2, "اتضاف فرع الشريك ومخزنه الوهمي");
}
export async function savePartnerBranch(fd: FormData) {
  await need("partner.manage");
  const sb = await supabaseServer();
  const { error } = await sb.from("partner_branches").update({ branch_id: S(fd, "branch") || null, near: S(fd, "near") !== "far" }).eq("location_id", S(fd, "loc"));
  await done("/partner", error, "اتحفظ");
}
export async function addDiscount(fd: FormData) {
  await need("partner.manage");
  const sb = await supabaseServer();
  const { error } = await sb.from("partner_discounts").insert({ partner_id: N(fd, "partner"), family_id: S(fd, "family") ? N(fd, "family") : null, item_id: S(fd, "item") ? N(fd, "item") : null, pct: N(fd, "pct") });
  await done("/partner", error, "اتحفظت نسبة الخصم");
}
export async function reviewed(fd: FormData) {
  await need("partner.manage", "prices.edit");
  const sb = await supabaseServer();
  const { error } = await sb.from("partner_items").update({ review: false }).eq("partner_id", N(fd, "partner")).eq("code", S(fd, "code"));
  await done("/partner", error, "اتعلّم متراجع");
}
export async function mapCode(fd: FormData) {
  await need("partner.upload", "partner.manage");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("partner_map", { p_partner: N(fd, "partner"), p_code: S(fd, "code"), p_item: N(fd, "item") });
  await done(`/partner/upload/${S(fd, "u")}`, error, "اتربط");
}
export async function approveUpload(fd: FormData) {
  await need("partner.upload");
  const sb = await supabaseServer();
  const fix: Record<string, number> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("fix:") && String(v).trim() !== "") fix[k.slice(4)] = Number(v);
  const { data, error } = await sb.rpc("partner_upload_approve", { p_id: N(fd, "id"), p_fix: fix });
  const r = data as { items: number; price_changed: number } | null;
  await done(`/partner/upload/${N(fd, "id")}`, error, r ? `اتعمد: ${r.items} صنف${r.price_changed ? ` — ${r.price_changed} سعر اتغيّر ومحتاج مراجعة في التسعير` : ""}` : "");
}
export async function partnerEntry(fd: FormData) {
  await need("partner.settle");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("partner_entry", { p_partner: N(fd, "partner"), p_kind: S(fd, "kind"), p_amount: N(fd, "amount"), p_method: S(fd, "method") || null, p_note: S(fd, "note") });
  await done(`/partner/account?p=${N(fd, "partner")}`, error, "اتسجّل");
}
