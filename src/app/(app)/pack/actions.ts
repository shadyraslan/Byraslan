"use server";
import { deny } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export type Packed = { sn: number; item_name: string; weight: number; unit: string; expires_at: string | null };

/** مسح ملصق الميزان ← علبة برقم مسلسل + دخول مخزون المصنع */
export async function packFinish(order: number): Promise<Result<{ msg: string }>> {
  { const g = await deny("prod.pack"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("prod_pack_finish", { p_order: order });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, msg: String(data) };
}

export async function packBox(code: string, order?: number | null): Promise<Result<{ box: Packed }>> {
  { const g = await deny("prod.pack"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("pack_box", { p_code: code.replace(/\D/g, ""), p_order: order ? String(order) : null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as unknown as Packed | undefined;
  if (!row) return { ok: false, error: "ماطلعش رد من السيستم" };
  return { ok: true, box: row };
}
