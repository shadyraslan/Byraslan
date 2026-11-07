"use server";
import { need } from "@/lib/perms";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

const done = (q: string) => { revalidatePath("/offers"); redirect(`/offers?${q}`); };
const num = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : Number(v));
const ts = (v: FormDataEntryValue | null) => (v && String(v) ? new Date(`${v}:00+02:00`).toISOString() : null);

/** حفظ عرض/بروموكود (جديد أو تعديل) */
export async function savePromo(fd: FormData) {
  await need("promo.edit");
  const sb = await supabaseServer();
  const auto = fd.get("mode") === "auto";
  let code = String(fd.get("code") || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!auto && !code) code = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  const row = {
    name: String(fd.get("name") || "").trim(), kind: String(fd.get("kind")), value: Number(fd.get("value")), max_off: num(fd.get("max_off")),
    auto, code: auto ? null : code, min_order: Number(fd.get("min_order") || 0), starts_at: ts(fd.get("starts")), ends_at: ts(fd.get("ends")),
    max_uses: num(fd.get("max_uses")), max_per_customer: num(fd.get("max_per")),
    channels: fd.getAll("ch").map(String), locations: fd.getAll("loc").map(String), families: fd.getAll("fam").map(Number),
    stackable: fd.get("stack") === "on", first_order: fd.get("first") === "on", note: String(fd.get("note") || "") || null,
  };
  if (!row.name || !(row.value > 0) || !row.channels.length) return done(`err=${encodeURIComponent("اكتب الاسم والقيمة واختار قناة واحدة على الأقل")}`);
  if (!row.locations.length) (row as { locations: string[] | null }).locations = null;
  if (!row.families.length) (row as { families: number[] | null }).families = null;
  const id = Number(fd.get("id") || 0);
  const { error } = id ? await sb.from("promos").update(row).eq("id", id) : await sb.from("promos").insert(row);
  if (error) return done(`err=${encodeURIComponent(error.message.includes("duplicate") ? "الكود ده مستخدم قبل كده" : error.message)}`);
  done(`ok=${encodeURIComponent(auto ? "اتحفظ العرض" : `اتحفظ — الكود: ${code}`)}`);
}

export async function togglePromo(fd: FormData) {
  await need("promo.edit");
  const sb = await supabaseServer();
  await sb.from("promos").update({ active: fd.get("on") === "1" }).eq("id", Number(fd.get("id")));
  done("ok=" + encodeURIComponent("اتحفظ"));
}

/** البانرات وعروض الأصناف في التطبيق */
export async function saveOffer(fd: FormData) {
  await need("promo.edit");
  const sb = await supabaseServer();
  const kind = String(fd.get("kind"));
  const row = {
    kind, title: String(fd.get("title") || "") || null, subtitle: String(fd.get("subtitle") || "") || null, badge: String(fd.get("badge") || "") || null,
    cta: String(fd.get("cta") || "") || null, icon: String(fd.get("icon") || "") || null, bg: String(fd.get("bg") || "") || null,
    target_family: String(fd.get("family") || "") || null, item_id: num(fd.get("item")), pct: num(fd.get("pct")),
    starts_at: ts(fd.get("starts")), ends_at: ts(fd.get("ends")), sort: Number(fd.get("sort") || 0), active: fd.get("active") === "on",
  };
  if (kind === "item" && (!row.item_id || !row.pct)) return done(`err=${encodeURIComponent("عرض الصنف محتاج صنف ونسبة")}`);
  const id = Number(fd.get("id") || 0);
  const { error } = id ? await sb.from("app_offers").update(row).eq("id", id) : await sb.from("app_offers").insert(row);
  if (error) return done(`err=${encodeURIComponent(error.message)}`);
  done("ok=" + encodeURIComponent("اتحفظ") + "#app");
}
