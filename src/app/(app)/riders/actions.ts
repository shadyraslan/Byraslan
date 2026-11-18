"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const back = (e: { message: string } | null, ok: string) => redirect(`/riders?${e ? `err=${encodeURIComponent(e.message.replace(/^.*?ERROR:\s*/, ""))}` : `ok=${encodeURIComponent(ok)}`}`);

export async function saveRider(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("rider_save", { p_id: fd.get("id") ? Number(fd.get("id")) : null, p_name: String(fd.get("name") || ""), p_phone: String(fd.get("phone") || ""), p_kind: String(fd.get("kind") || "own"), p_loc: String(fd.get("loc") || ""), p_active: fd.get("active") !== "0" });
  revalidatePath("/riders"); back(error, "اتحفظ");
}
export async function settleRider(fd: FormData) {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("rider_settle", { p_rider: Number(fd.get("rider")), p_ids: null, p_shift_client: null });
  revalidatePath("/riders"); back(error, `اتسلّم ${data ?? 0} ج`);
}
export async function saveTudzi(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("tudzi_link_save", { p_loc: String(fd.get("loc")), p_url: String(fd.get("url") || ""), p_key: String(fd.get("key") || ""), p_auto: fd.get("auto") === "on", p_active: fd.get("active") === "on" });
  revalidatePath("/riders"); back(error, "اتحفظ ربط تودزي");
}
export async function saveTudziCfg(fd: FormData) {
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").upsert({ key: "tudzi", value: { fallback_min: Math.max(1, Number(fd.get("fb") || 10)) }, updated_at: new Date().toISOString() });
  revalidatePath("/riders"); back(error, "اتحفظ");
}
