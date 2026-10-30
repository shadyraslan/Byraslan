"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function addLocation(fd: FormData) {
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
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { data } = await sb.from("locations").select("active").eq("id", id).single();
  await sb.from("locations").update({ active: !data?.active }).eq("id", id);
  revalidatePath("/locations");
}
