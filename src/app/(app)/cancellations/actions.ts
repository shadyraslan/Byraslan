"use server";
import { revalidatePath } from "next/cache";
import { deny } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

const RPC = { trip: ["trip_cancel", "p_trip", "trips.load", "/trips"], prod: ["prod_cancel", "p_order", "prod.orders", "/production"], po: ["po_cancel", "p_po", "purchase.edit", "/purchasing"] } as const;

/** إلغاء رحلة / أمر إنتاج / أمر توريد — السبب إجباري ويوصل للإدارة */
export async function cancelThing(kind: keyof typeof RPC, id: number, reason: string): Promise<Result<{ done: true }>> {
  const [fn, arg, perm, path] = RPC[kind];
  { const g = await deny(perm); if (g) return g; }
  if (reason.trim().length < 3) return { ok: false, error: "اكتب سبب الإلغاء" };
  const sb = await supabaseServer();
  const { error } = await sb.rpc(fn, { [arg]: id, p_reason: reason.trim() });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath(path);
  return { ok: true, done: true };
}
