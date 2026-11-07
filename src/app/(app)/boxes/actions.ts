"use server";
import { deny } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export type BoxCard = {
  sn: number; item: string; unit: string; weight: number; status: string; location: string;
  packed_at: string; expires_at: string | null;
  history: { at: string; kind: string; qty: number; location_name: string; reason: string | null; by_name: string | null }[];
};

export async function getBox(sn: number): Promise<Result<{ box: BoxCard }>> {
  { const g = await deny("stock.view"); if (g) return g; }
  const sb = await supabaseServer();
  const { data: b, error } = await sb.from("boxes").select("sn,weight,status,location_id,packed_at,expires_at,items(name,unit),locations(name)").eq("sn", sn).maybeSingle();
  if (error) return { ok: false, error: dbMsg(error.message) };
  if (!b) return { ok: false, error: `العلبة #${sn} مش متسجّلة` };
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { name?: string; unit?: string } | null;
  const { data: h } = await sb.from("box_history").select("at,kind,qty,location_name,reason,by_name").eq("sn", sn).order("at");
  return {
    ok: true,
    box: {
      sn: b.sn, weight: Number(b.weight), status: b.status, packed_at: b.packed_at, expires_at: b.expires_at,
      item: one(b.items)?.name ?? "", unit: one(b.items)?.unit ?? "", location: one(b.locations)?.name ?? b.location_id,
      history: (h ?? []) as unknown as BoxCard["history"],
    },
  };
}

export async function resolveMissing(sn: number, found: boolean, note: string): Promise<Result<{ msg: string }>> {
  { const g = await deny("stock.edit", "stock.adjust"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("resolve_missing", { p_sn: sn, p_found: found, p_note: note || null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/transfers");
  revalidatePath("/stock");
  return { ok: true, msg: String(data) };
}

export async function disposeBoxes(loc: string, kind: "waste" | "donate", boxes: number[], reason: string): Promise<Result<{ n: number }>> {
  { const g = await deny("stock.waste", "stock.donate"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("dispose_boxes", { p_loc: loc, p_kind: kind, p_boxes: boxes, p_reason: reason });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/stock");
  return { ok: true, n: Number(data) };
}
