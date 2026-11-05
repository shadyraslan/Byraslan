"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export async function createOrder(_: unknown, fd: FormData): Promise<Result<{ id: number }> | null> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("prod_create", {
    p_item: Number(fd.get("item")), p_qty: Number(fd.get("qty")), p_due: String(fd.get("due") || "") || null, p_note: String(fd.get("note") || "") || null,
  });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/production");
  revalidatePath("/station");
  return { ok: true, id: Number(data) };
}

export async function saveRoute(fd: FormData) {
  const sb = await supabaseServer();
  const steps = fd.getAll("step").map(String).filter(Boolean);
  if (!steps.length) return;
  await sb.rpc("set_route", { p_item: Number(fd.get("item")), p_sections: steps });
  revalidatePath("/production/routes");
}

export async function stepStart(order: number, step: number, inW: number): Promise<Result<{ msg: string }>> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("prod_start", { p_order: order, p_step: step, p_in: inW });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/station");
  revalidatePath("/production");
  return { ok: true, msg: "بدأ" };
}

export async function stepFinish(order: number, step: number, out: number, waste: number): Promise<Result<{ msg: string }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("prod_finish", { p_order: order, p_step: step, p_out: out, p_waste: waste });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/station");
  revalidatePath("/production");
  return { ok: true, msg: String(data) };
}
