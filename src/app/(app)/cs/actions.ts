"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function saveCsSettings(fd: FormData) {
  const sb = await supabaseServer();
  const now = new Date().toISOString();
  await sb.from("settings").upsert([
    { key: "cs.sla_minutes", value: Math.max(Number(fd.get("sla") || 15), 1), updated_at: now },
    { key: "cs.canned", value: String(fd.get("canned") || "").split(/\n/).map((x) => x.trim()).filter(Boolean), updated_at: now },
  ]);
  revalidatePath("/cs");
}
