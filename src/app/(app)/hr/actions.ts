"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function decideAttendance(fd: FormData) {
  await need("hr.attendance");
  const sb = await supabaseServer();
  await sb.rpc("decide_attendance", { p_id: Number(fd.get("id")), p_ok: fd.get("ok") === "1", p_note: String(fd.get("note") || "") });
  revalidatePath("/hr");
}
export async function resetDevice(fd: FormData) {
  await need("hr.attendance", "users.manage");
  const sb = await supabaseServer();
  await sb.from("staff_devices").update({ device_id: "*" }).eq("user_id", String(fd.get("user")));
  revalidatePath("/hr");
}
export async function decideLeave(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  await sb.rpc("decide_leave", { p_id: Number(fd.get("id")), p_ok: fd.get("ok") === "1", p_note: String(fd.get("note") || "") });
  revalidatePath("/hr/leaves");
}
export async function sendMessage(fd: FormData) {
  await need("hr.messages");
  const sb = await supabaseServer();
  const target = String(fd.get("target") || "all");
  await sb.from("staff_messages").insert({
    title: String(fd.get("title") || "").trim(), body: String(fd.get("body") || "").trim(), target,
    location_id: target === "loc" ? String(fd.get("loc") || "") || null : null,
    user_id: target === "user" ? String(fd.get("user") || "") || null : null,
    needs_ack: fd.get("ack") === "on",
  });
  revalidatePath("/hr/messages");
}
