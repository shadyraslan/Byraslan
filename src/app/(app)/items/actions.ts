"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

const pluOf = (v: FormDataEntryValue | null) => { const d = String(v ?? "").replace(/\D/g, ""); return d ? d.padStart(5, "0") : null; };
const intOf = (v: FormDataEntryValue | null) => { const n = parseInt(String(v ?? ""), 10); return Number.isFinite(n) && n > 0 ? n : null; };

export async function updateItem(fd: FormData) {
  const me = await getMe();
  if (!can(me, "items.edit")) throw new Error("ليس لديك صلاحية تعديل الأصناف");
  const sb = await supabaseServer();
  await sb.from("items").update({ scale_plu: pluOf(fd.get("scale_plu")), shelf_days: intOf(fd.get("shelf_days")) }).eq("id", Number(fd.get("id")));
  revalidatePath("/items");
}

const tagsOf = (s: string) => [...new Set(s.split(/[\s,،]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean))];

export async function addItem(fd: FormData) {
  const me = await getMe();
  if (!can(me, "items.edit")) throw new Error("ليس لديك صلاحية إضافة أصناف");
  const sb = await supabaseServer();
  const fam = String(fd.get("family_id") || "");
  const { data } = await sb
    .from("items")
    .insert({
      name: String(fd.get("name")).trim(),
      arm: String(fd.get("arm")),
      unit: String(fd.get("unit")),
      family_id: fam ? Number(fam) : null,
      tags: tagsOf(String(fd.get("tags") || "")),
      kind: String(fd.get("kind") || "product"),
      scale_plu: pluOf(fd.get("scale_plu")),
      shelf_days: intOf(fd.get("shelf_days")),
      sold_by: String(fd.get("unit")) === "قطعة" ? "piece" : "weight",
    })
    .select("id")
    .single();
  const bc = String(fd.get("barcode") || "").trim();
  if (data && bc) await sb.from("item_barcodes").insert({ code: bc, item_id: data.id });
  revalidatePath("/items");
}

export async function addFamily(fd: FormData) {
  const me = await getMe();
  if (!can(me, "items.edit")) throw new Error("ليس لديك صلاحية إضافة عائلات");
  const sb = await supabaseServer();
  const p = String(fd.get("parent_id") || "");
  await sb.from("families").insert({
    name: String(fd.get("name")).trim(),
    arm: String(fd.get("arm")),
    parent_id: p ? Number(p) : null,
    tag: String(fd.get("tag") || "").replace(/^#/, "").trim() || null,
  });
  revalidatePath("/items");
}
