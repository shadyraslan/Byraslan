"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function addLocation(fd: FormData) {
  await need("stock.edit", "settings.edit");
  const sb = await supabaseServer();
  await sb.from("locations").insert({
    id: String(fd.get("id")).trim(),
    name: String(fd.get("name")).trim(),
    type: String(fd.get("type")),
    parent: String(fd.get("parent") || "") || null,
    city: String(fd.get("city") || "") || null,
  });
  revalidatePath("/locations");
}

export async function toggleLocation(fd: FormData) {
  await need("stock.edit", "settings.edit");
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { data } = await sb.from("locations").select("active").eq("id", id).single();
  await sb.from("locations").update({ active: !data?.active }).eq("id", id);
  revalidatePath("/locations");
}

// إحداثيات الموقع ونطاق الحضور (متر)
export async function saveGeo(fd: FormData) {
  await need("stock.edit", "settings.edit");
  const sb = await supabaseServer();
  const raw = String(fd.get("geo") || "").trim();
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*[,،\s]\s*(-?\d+(?:\.\d+)?)/);
  await sb.from("locations").update({ lat: m ? Number(m[1]) : null, lng: m ? Number(m[2]) : null, radius_m: Math.max(Number(fd.get("radius") || 150), 20) }).eq("id", String(fd.get("id")));
  revalidatePath("/locations");
}
