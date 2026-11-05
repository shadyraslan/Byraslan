"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export type BoxInfo = { sn: number; item: string; weight: number; unit: string };

/** العلبة دي ينفع تتحوّل من المكان ده؟ */
export async function checkBox(sn: number, from: string): Promise<Result<{ box: BoxInfo }>> {
  const sb = await supabaseServer();
  const { data: b, error } = await sb.from("boxes").select("sn,weight,status,location_id,expires_at,items(name,unit)").eq("sn", sn).maybeSingle();
  if (error) return { ok: false, error: dbMsg(error.message) };
  if (!b) return { ok: false, error: `العلبة #${sn} مش متسجّلة` };
  const it = (Array.isArray(b.items) ? b.items[0] : b.items) as { name: string; unit: string } | null;
  const st: Record<string, string> = { transit: "في تحويل لسه في الطريق", sold: "اتباعت", waste: "اتسجّلت هالك", donated: "اتحوّلت للتبرعات", missing: "متسجّلة ناقصة في تحويل", loaded: "متحمّلة على عربية" };
  if (b.status !== "stock") return { ok: false, error: `العلبة #${sn} ${st[b.status] ?? b.status}` };
  if (b.location_id !== from) {
    const { data: l } = await sb.from("locations").select("name").eq("id", b.location_id).maybeSingle();
    return { ok: false, error: `العلبة #${sn} مش هنا — هي في ${l?.name ?? b.location_id}` };
  }
  if (b.expires_at && new Date(b.expires_at) < new Date()) return { ok: false, error: `العلبة #${sn} صلاحيتها خلصت` };
  return { ok: true, box: { sn: b.sn, item: it?.name ?? "", weight: Number(b.weight), unit: it?.unit ?? "" } };
}

export async function sendTransfer(from: string, to: string, boxes: number[], reason: string, note: string): Promise<Result<{ id: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("transfer_boxes", { p_from: from, p_to: to, p_boxes: boxes, p_reason: reason || null, p_note: note || null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/transfers");
  revalidatePath("/stock");
  return { ok: true, id: Number(data) };
}

export async function receiveTransfer(id: number, scanned: number[]): Promise<Result<{ missing: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("receive_transfer", { p_id: id, p_scanned: scanned });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/transfers");
  revalidatePath("/stock");
  return { ok: true, missing: Number(data) };
}
