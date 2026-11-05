"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export async function createTrip(fd: FormData) {
  const sb = await supabaseServer();
  const { data } = await sb.from("trips").insert({ truck: String(fd.get("truck") || "").trim() || "عربية", driver: String(fd.get("driver") || "").trim() || null }).select("id").single();
  revalidatePath("/trips");
  if (data) redirect(`/trips/${data.id}`);
}

export type CrateState = { crate: string; to_loc: string; boxes: { sn: number; item: string }[] };

export async function tripState(trip: number): Promise<CrateState[]> {
  const sb = await supabaseServer();
  const [{ data: cr }, { data: bx }] = await Promise.all([
    sb.from("trip_crates").select("crate_id,to_loc").eq("trip_id", trip),
    sb.from("trip_boxes").select("crate_id,box_sn,boxes(items(name))").eq("trip_id", trip).eq("removed", false).order("at"),
  ]);
  const name = (v: unknown): string => {
    const b = (Array.isArray(v) ? v[0] : v) as { items?: unknown } | null;
    const i = (Array.isArray(b?.items) ? b?.items[0] : b?.items) as { name?: string } | null;
    return i?.name ?? "";
  };
  return (cr ?? []).map((c) => ({
    crate: c.crate_id as string,
    to_loc: c.to_loc as string,
    boxes: (bx ?? []).filter((b) => b.crate_id === c.crate_id).map((b) => ({ sn: Number(b.box_sn), item: name(b.boxes) })),
  }));
}

export async function crateOpen(trip: number, crate: string, to: string | null): Promise<Result<{ to: string | null }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("crate_open", { p_trip: trip, p_crate: crate, p_to: to });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, to: (data as string | null) ?? null };
}

export async function loadBox(trip: number, crate: string, sn: number): Promise<Result<{ item: string }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("load_box", { p_trip: trip, p_crate: crate, p_sn: sn });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, item: String(data ?? "") };
}

export async function unloadBox(trip: number, sn: number): Promise<Result<{ sn: number }>> {
  const sb = await supabaseServer();
  const { error } = await sb.rpc("unload_box", { p_trip: trip, p_sn: sn });
  if (error) return { ok: false, error: dbMsg(error.message) };
  return { ok: true, sn };
}

export async function tripDepart(trip: number): Promise<Result<{ n: number }>> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("trip_depart", { p_trip: trip });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/trips");
  revalidatePath("/transfers");
  revalidatePath("/stock");
  return { ok: true, n: Number(data) };
}
