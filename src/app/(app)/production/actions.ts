"use server";
import { need, deny } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export async function createOrder(_: unknown, fd: FormData): Promise<Result<{ id: number }> | null> {
  { const g = await deny("prod.orders"); if (g) return g; }
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
  await need("prod.orders");
  const sb = await supabaseServer();
  const raw = fd.getAll("step").map(String);
  const ys = fd.getAll("yield").map(String);
  const steps: string[] = [], yields: number[] = [];
  raw.forEach((s, i) => { if (s) { steps.push(s); yields.push(Number(ys[i]) || 100); } });
  if (!steps.length) return;
  await sb.rpc("set_route2", { p_item: Number(fd.get("item")), p_sections: steps, p_yields: yields });
  revalidatePath("/production/routes");
}

export async function saveYieldTol(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  await sb.from("settings").upsert({ key: "prod_yield", value: { tol_pct: Math.min(Math.max(Number(fd.get("tol") || 5), 0), 50) }, updated_at: new Date().toISOString() });
  revalidatePath("/production/routes");
}

export async function stepStart(order: number, step: number, inW: number): Promise<Result<{ msg: string }>> {
  { const g = await deny("prod.orders"); if (g) return g; }
  const sb = await supabaseServer();
  const { error } = await sb.rpc("prod_start", { p_order: order, p_step: step, p_in: inW });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/station");
  revalidatePath("/production");
  return { ok: true, msg: "بدأ" };
}

export async function stepFinish(order: number, step: number, out: number, waste: number): Promise<Result<{ msg: string }>> {
  { const g = await deny("prod.orders"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("prod_finish", { p_order: order, p_step: step, p_out: out, p_waste: waste });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/station");
  revalidatePath("/production");
  return { ok: true, msg: String(data) };
}
