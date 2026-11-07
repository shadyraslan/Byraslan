"use server";
import { need, deny } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg, type Result } from "@/lib/scan";

export async function addSupplier(fd: FormData) {
  await need("purchase.edit");
  const sb = await supabaseServer();
  await sb.from("suppliers").insert({ name: String(fd.get("name")).trim(), phone: String(fd.get("phone") || "").trim() || null, terms: String(fd.get("terms") || "").trim() || null });
  revalidatePath("/purchasing/suppliers");
}

export async function updateSupplier(fd: FormData) {
  await need("purchase.edit");
  const sb = await supabaseServer();
  await sb.from("suppliers").update({ phone: String(fd.get("phone") || "").trim() || null, terms: String(fd.get("terms") || "").trim() || null }).eq("id", Number(fd.get("id")));
  revalidatePath("/purchasing/suppliers");
}

export type PoLine = { item_id: number; qty: number; price: number };

export async function createPo(supplier: number, expected: string, note: string, lines: PoLine[]): Promise<Result<{ id: number }>> {
  { const g = await deny("purchase.edit"); if (g) return g; }
  const sb = await supabaseServer();
  const L = lines.filter((l) => l.item_id && l.qty > 0);
  if (!supplier) return { ok: false, error: "اختار المورد" };
  if (!L.length) return { ok: false, error: "ضيف صنف واحد على الأقل" };
  const { data: po, error } = await sb.from("purchase_orders").insert({ supplier_id: supplier, expected: expected || null, note: note || null }).select("id").single();
  if (error || !po) return { ok: false, error: dbMsg(error?.message) };
  const { error: e2 } = await sb.from("po_lines").insert(L.map((l, i) => ({ po_id: po.id, line: i + 1, item_id: l.item_id, qty: l.qty, price: l.price })));
  if (e2) return { ok: false, error: dbMsg(e2.message) };
  revalidatePath("/purchasing");
  return { ok: true, id: Number(po.id) };
}

export async function cancelPo(fd: FormData) {
  await need("purchase.edit");
  const sb = await supabaseServer();
  await sb.from("purchase_orders").update({ status: "cancelled" }).eq("id", Number(fd.get("id"))).eq("status", "open");
  revalidatePath("/purchasing");
}

/* ---------- كارت الصنف ---------- */
export type SpecIn = { brand: string; description: string; size: string; temp_max: string; min_shelf_days: string; waste_pct: string; checks: string; certs: string; img_ok: string | null; img_bad: string | null };

export async function saveSpec(item: number, s: SpecIn): Promise<Result<{ saved: true }>> {
  { const g = await deny("purchase.edit"); if (g) return g; }
  const sb = await supabaseServer();
  const lines = (t: string) => t.split("\n").map((x) => x.trim()).filter(Boolean);
  const num = (t: string) => (t.trim() === "" ? null : Number(t));
  const { error } = await sb.from("item_specs").upsert({
    item_id: item, brand: s.brand || null, description: s.description || null, size: s.size || null,
    temp_max: num(s.temp_max), min_shelf_days: num(s.min_shelf_days) ?? 0, waste_pct: num(s.waste_pct) ?? 0,
    checks: lines(s.checks), certs: lines(s.certs), img_ok: s.img_ok, img_bad: s.img_bad, dirty: true, updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath(`/purchasing/specs/${item}`);
  return { ok: true, saved: true };
}

export async function approveSpec(item: number, what: string): Promise<Result<{ v: number }>> {
  { const g = await deny("qa.approve"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("approve_spec", { p_item: item, p_what: what || null });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath(`/purchasing/specs/${item}`);
  revalidatePath("/purchasing/specs");
  return { ok: true, v: Number(data) };
}

export async function saveItemSupplier(fd: FormData) {
  await need("purchase.edit");
  const sb = await supabaseServer();
  const item = Number(fd.get("item")), rank = Number(fd.get("rank"));
  const sup = Number(fd.get("supplier") || 0);
  const price = String(fd.get("price") || "").trim();
  if (!sup) return;
  await sb.from("item_suppliers").upsert({ item_id: item, rank, supplier_id: sup, brand: String(fd.get("brand") || "").trim() || null, price: price ? Number(price) : null });
  revalidatePath(`/purchasing/specs/${item}`);
}

export async function addAltBrand(fd: FormData) {
  await need("purchase.edit");
  const sb = await supabaseServer();
  const item = Number(fd.get("item"));
  const brand = String(fd.get("brand") || "").trim();
  if (!brand) return;
  await sb.from("item_alt_brands").insert({ item_id: item, brand, note: String(fd.get("note") || "").trim() || null });
  await sb.from("item_specs").update({ dirty: true }).eq("item_id", item);
  revalidatePath(`/purchasing/specs/${item}`);
}

/* ---------- الاستلام ---------- */
export type RecvLine = { line: number; weighed: number; rejected: number; price: number; temp: number | null; expires: string | null; note: string; checks: { t: string; ok: boolean }[]; docs: { n: string; photo?: string; missing?: boolean }[] };

export async function receivePo(po: number, lines: RecvLine[], reason: string | null, override: number | null, invoice: string | null): Promise<Result<{ no: number | null; lots: string[]; violations: string[] }>> {
  { const g = await deny("purchase.edit", "stock.edit"); if (g) return g; }
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("receive_po", { p_po: po, p_lines: lines, p_override: override, p_reason: reason, p_invoice: invoice });
  if (error) return { ok: false, error: dbMsg(error.message) };
  const r = (Array.isArray(data) ? data[0] : data) as { receipt_no: number | null; lot_codes: string[] | null; violations: string[] | null };
  if (r.receipt_no) { revalidatePath("/purchasing"); revalidatePath("/stock"); }
  return { ok: true, no: r.receipt_no ? Number(r.receipt_no) : null, lots: r.lot_codes ?? [], violations: r.violations ?? [] };
}

export async function requestOverride(po: number, poNo: number, violations: string[], value: number, reason: string): Promise<Result<{ id: number }>> {
  { const g = await deny("purchase.edit", "stock.edit"); if (g) return g; }
  const sb = await supabaseServer();
  if (reason.trim().length < 5) return { ok: false, error: "اكتب السبب" };
  const { data, error } = await sb.from("override_requests").insert({ kind: "recv", ref: `PO-${poNo}`, violations, value, reason }).select("id").single();
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/overrides");
  return { ok: true, id: Number(data.id) };
}

export async function decideOverride(fd: FormData) {
  await need();
  const sb = await supabaseServer();
  await sb.rpc("decide_override", { p_id: Number(fd.get("id")), p_approve: fd.get("approve") === "1", p_note: String(fd.get("note") || "") });
  revalidatePath("/overrides");
}

export async function goReceive(fd: FormData) {
  await need("purchase.edit", "stock.edit");
  redirect(`/purchasing/receive/${Number(fd.get("id"))}`);
}
