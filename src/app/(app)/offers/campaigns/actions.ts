"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");
const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const ts = (v: string) => (v ? new Date(`${v}:00+02:00`).toISOString() : null);
async function back(id: number | string, error: { message?: string } | null, ok: string): Promise<never> {
  revalidatePath(`/offers/campaigns/${id}`);
  redirect(`/offers/campaigns/${id}?${error ? `err=${encodeURIComponent(msg(error))}` : `ok=${encodeURIComponent(ok)}`}`);
}

export async function saveCampaign(fd: FormData) {
  await need("promo.edit");
  const sb = await supabaseServer();
  const row = { name: S(fd, "name"), subtitle: S(fd, "subtitle") || null, color: S(fd, "color") || "#E11D48", starts_at: ts(S(fd, "starts")), ends_at: ts(S(fd, "ends")),
    locations: fd.getAll("loc").map(String), channels: fd.getAll("ch").map(String) };
  if (!row.name || !row.starts_at || !row.ends_at || !row.channels.length) redirect(`/offers/campaigns?err=${encodeURIComponent("اكتب الاسم والمدة واختار قناة")}`);
  if (!row.locations.length) (row as { locations: string[] | null }).locations = null;
  const id = Number(S(fd, "id") || 0);
  if (id) { const { error } = await sb.from("campaigns").update(row).eq("id", id); await back(id, error, "اتحفظ"); }
  const { data, error } = await sb.from("campaigns").insert(row).select("id").single();
  if (error) redirect(`/offers/campaigns?err=${encodeURIComponent(msg(error))}`);
  redirect(`/offers/campaigns/${data!.id}`);
}
export async function addItems(fd: FormData) {
  await need("promo.edit");
  const sb = await supabaseServer();
  const id = Number(S(fd, "id"));
  const rows: { campaign_id: number; item_id: number; price: number; app_price: number | null }[] = [];
  for (const [k, v] of fd.entries()) {
    const m = k.match(/^p:(\d+)$/);
    if (m && String(v).trim() !== "") { const a = S(fd, `a:${m[1]}`); rows.push({ campaign_id: id, item_id: Number(m[1]), price: Number(v), app_price: a ? Number(a) : null }); }
  }
  const one = Number(S(fd, "item") || 0);
  if (one && S(fd, "price")) rows.push({ campaign_id: id, item_id: one, price: Number(S(fd, "price")), app_price: S(fd, "app") ? Number(S(fd, "app")) : null });
  // خصم جماعي بنسبة على قسم كامل
  const fam = Number(S(fd, "fam") || 0), pct = Number(S(fd, "pct") || 0);
  if (fam && pct > 0 && pct < 100) {
    const { data: its } = await sb.from("items").select("id").eq("active", true).eq("family_id", fam);
    const { data: pr } = await sb.from("prices").select("item_id,price").eq("channel", "direct").in("item_id", (its ?? []).map((i) => i.id));
    const mx = new Map<number, number>(); for (const p of pr ?? []) mx.set(p.item_id, Math.max(mx.get(p.item_id) ?? 0, Number(p.price)));
    for (const [it, p] of mx) rows.push({ campaign_id: id, item_id: it, price: Math.round(p * (1 - pct / 100)), app_price: null });
  }
  if (!rows.length) await back(id, { message: "اختار صنف وسعر" }, "");
  const { error } = await sb.from("campaign_items").upsert(rows);
  await back(id, error, `اتضاف ${rows.length} صنف`);
}
export async function removeItem(fd: FormData) {
  await need("promo.edit");
  const sb = await supabaseServer();
  const id = Number(S(fd, "id"));
  const { error } = await sb.from("campaign_items").delete().eq("campaign_id", id).eq("item_id", Number(S(fd, "item")));
  await back(id, error, "اتشال");
}
export async function campaignAct(fd: FormData) {
  await need("promo.edit", "promo.approve", "labels.hang", "pos.shift");
  const sb = await supabaseServer();
  const id = Number(S(fd, "id")), a = S(fd, "a");
  const r = a === "submit" ? await sb.rpc("campaign_submit", { p_id: id })
    : a === "approve" || a === "reject" ? await sb.rpc("campaign_approve", { p_id: id, p_ok: a === "approve", p_note: S(fd, "note") || null })
    : a === "cancel" ? await sb.rpc("campaign_cancel", { p_id: id })
    : await sb.rpc("campaign_branch", { p_id: id, p_loc: S(fd, "loc"), p_what: a === "hung" ? "hung" : "removed" });
  const ok: Record<string, string> = { submit: "اتبعت للاعتماد", approve: "اتعمد — هيبدأ في ميعاده لوحده", reject: "اترجع مسودة", cancel: "اتوقف والأسعار رجعت", hung: "اتسجّل إن الملصقات اتعلّقت", removed: "اتسجّل إن الملصقات اتشالت" };
  await back(id, r.error, ok[a] ?? "تمام");
}

/** ألوان الملصقات ومعناها — صاحب صلاحية promo.colors بس (المالك أو الماركتنج) */
export async function saveColors(fd: FormData) {
  await need("promo.colors");
  const sb = await supabaseServer();
  const c = fd.getAll("c").map(String), t = fd.getAll("t").map(String);
  const del = new Set(fd.getAll("del").map(String));
  const rows = c.map((x, i) => ({ c: x, t: (t[i] ?? "").trim() })).filter((x, i) => !del.has(String(i)) && /^#[0-9a-f]{6}$/i.test(x.c));
  const nc = S(fd, "nc"), nt = S(fd, "nt");
  if (nc && fd.get("add") === "on") rows.push({ c: nc, t: nt });
  const { error } = await sb.rpc("campaign_colors_save", { p: rows });
  revalidatePath("/offers/campaigns");
  redirect(`/offers/campaigns?${error ? `err=${encodeURIComponent(msg(error))}` : "ok=1"}`);
}
