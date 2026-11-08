"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

export async function addLocation(fd: FormData) {
  const me = await getMe();
  if (!can(me, "settings.edit")) throw new Error("ليس لديك صلاحية إضافة مواقع");
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
  const me = await getMe();
  if (!can(me, "settings.edit")) throw new Error("ليس لديك صلاحية تعديل حالة المواقع");
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  const { data } = await sb.from("locations").select("active").eq("id", id).single();
  await sb.from("locations").update({ active: !data?.active }).eq("id", id);
  revalidatePath("/locations");
}
