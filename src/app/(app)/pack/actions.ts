"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export type Packed = { sn: number; item_name: string; weight: number; unit: string; expires_at: string | null };

/** مسح ملصق الميزان ← علبة برقم مسلسل + دخول مخزون المصنع */
export async function packBox(code: string, order?: string): Promise<Result<{ box: Packed }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("pack_box", { p_code: code.replace(/\D/g, ""), p_order: order || null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const row = (Array.isArray(data) ? data[0] : data) as unknown as Packed | undefined;
  if (!row) return { ok: false, error: "ماطلعش رد من السيستم" };
  return { ok: true, box: row };
}
