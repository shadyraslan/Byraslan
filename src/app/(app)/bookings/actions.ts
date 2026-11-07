"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function setDeposit(fd: FormData) {
  await need("orders.booking", "orders.handle", "cs.agent");
  const sb = await supabaseServer();
  await sb.rpc("booking_deposit", { p_token: String(fd.get("token")), p_paid: fd.get("paid") === "1" });
  revalidatePath("/bookings");
}
export async function saveBookingCfg(fd: FormData) {
  await need("orders.booking", "settings.edit");
  const sb = await supabaseServer();
  const n = (k: string, d: number) => { const v = Number(fd.get(k)); return Number.isFinite(v) && String(fd.get(k) ?? "") !== "" ? v : d; };
  const slots = String(fd.get("slots") || "").split(/[,،\s]+/).map((x) => x.trim()).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).map((x) => x.padStart(5, "0"));
  await sb.from("settings").upsert({ key: "booking", updated_at: new Date().toISOString(), value: {
    on: fd.get("on") === "on", days_ahead: n("days", 30), lead_hours: n("lead", 12), edit_cutoff_hours: n("cutoff", 24), release_hours: n("release", 3),
    remind_hours: n("remind", 24), edit_cutoff_mode: String(fd.get("cutmode") || "midnight") === "hours" ? "hours" : "midnight", deposit_pct: n("deposit", 0), max_per_slot: n("max", 0), slot_minutes: n("slotmin", 120), slots } });
  revalidatePath("/bookings");
}
