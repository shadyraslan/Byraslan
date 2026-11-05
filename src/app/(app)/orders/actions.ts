"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

const done = (id: number) => { revalidatePath("/orders"); revalidatePath(`/orders/${id}`); };

export async function setStatus(id: number, status: string, driver?: string, reason?: string): Promise<Result<{ done: true }>> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("order_status", { p_id: id, p_status: status, p_driver: driver ?? null, p_reason: reason ?? null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  done(id); return { ok: true, done: true };
}
export async function scanToOrder(id: number, code: string): Promise<Result<{ msg: string }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("order_scan", { p_id: id, p_code: code, p_qty: null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  done(id); return { ok: true, msg: String(data) };
}
export async function unscan(id: number, sn: number): Promise<Result<{ done: true }>> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("order_unscan", { p_id: id, p_sn: sn });
  if (error) return { ok: false, error: dbMsg(error.message) };
  done(id); return { ok: true, done: true };
}
export async function deliver(id: number): Promise<Result<{ total: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("order_deliver", { p_id: id });
  if (error) return { ok: false, error: dbMsg(error.message) };
  done(id); revalidatePath("/accounts"); return { ok: true, total: Number(data) };
}
