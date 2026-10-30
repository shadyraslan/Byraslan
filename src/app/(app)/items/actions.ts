"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

const tagsOf = (s: string) => [...new Set(s.split(/[\s,،]+/).map((t) => t.replace(/^#/, "").trim()).filter(Boolean))];

export async function addItem(fd: FormData) {
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
    })
    .select("id")
    .single();
  const bc = String(fd.get("barcode") || "").trim();
  if (data && bc) await sb.from("item_barcodes").insert({ code: bc, item_id: data.id });
  revalidatePath("/items");
}

export async function addFamily(fd: FormData) {
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
