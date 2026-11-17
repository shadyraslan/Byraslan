"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function saveCsSettings(fd: FormData) {
  await need("cs.manage", "settings.edit");
  const sb = await supabaseServer();
  const now = new Date().toISOString();
  await sb.from("settings").upsert([
    { key: "cs.sla_minutes", value: Math.max(Number(fd.get("sla") || 15), 1), updated_at: now },
    { key: "cs.canned", value: String(fd.get("canned") || "").split(/\n/).map((x) => x.trim()).filter(Boolean), updated_at: now },
  ]);
  revalidatePath("/cs");
}

// إلغاء حجز / عربون من شاشة المتابعة
export async function cancelBooking(fd: FormData) {
  await need("cs.agent", "orders.handle");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("booking_edit", { p_token: String(fd.get("token")), p_lines: null, p_date: null, p_slot: null, p_address: null, p_note: null, p_cancel: true, p_reason: String(fd.get("reason") || "") || null });
  revalidatePath("/cs/orders");
  const { redirect } = await import("next/navigation");
  redirect(error ? `/cs/orders?scope=bookings&err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : "/cs/orders?scope=bookings");
}
export async function toggleDeposit(fd: FormData) {
  await need("cs.agent", "orders.handle", "orders.booking");
  const sb = await supabaseServer();
  await sb.rpc("booking_deposit", { p_token: String(fd.get("token")), p_paid: fd.get("paid") === "1" });
  revalidatePath("/cs/orders");
}
// عميل جديد أو تعديل
export async function saveCustomer(fd: FormData) {
  await need("cs.agent", "orders.handle");
  const sb = await supabaseServer();
  const { data: cid, error: e1 } = await sb.rpc("cs_customer_save", {
    p_phone: String(fd.get("phone") || ""), p_name: String(fd.get("name") || ""), p_notes: String(fd.get("notes") || ""),
    p_district: null, p_address: "", p_label: "",
  });
  let error = e1;
  // العنوان بخاناته: الشارع، الدور، الشقة، العلامة المميزة
  if (!error && fd.get("district") && String(fd.get("address") || "").trim()) {
    ({ error } = await sb.rpc("cs_address_save", {
      p_customer: Number(cid), p_id: null, p_label: String(fd.get("label") || ""), p_district: Number(fd.get("district")),
      p_address: String(fd.get("address") || ""), p_floor: String(fd.get("floor") || ""), p_apt: String(fd.get("apt") || ""), p_landmark: String(fd.get("landmark") || ""), p_default: false,
    }));
  }
  revalidatePath("/cs/customers");
  const { redirect } = await import("next/navigation");
  const ph = encodeURIComponent(String(fd.get("phone") || ""));
  const msg = error ? encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, "")) : "";
  // من شاشة الطلب: بيرجع يكمّل الطلب للعميل ده على طول
  if (fd.get("back") === "new") redirect(error ? `/cs/new?phone=${ph}&ch=${fd.get("ch") ?? "whatsapp"}&err=${msg}` : `/cs/new?phone=${ph}&ch=${fd.get("ch") ?? "whatsapp"}`);
  redirect(error ? `/cs/customers?err=${msg}&q=${ph}` : `/cs/customers?ok=1&q=${ph}`);
}

// تعديل بيانات العميل وعناوينه (صفحة العميل)
export async function editCustomer(fd: FormData) {
  await need("cs.agent", "orders.handle");
  const sb = await supabaseServer();
  const id = Number(fd.get("id"));
  const { error } = await sb.rpc("cs_customer_edit", { p_id: id, p_name: String(fd.get("name") || ""), p_notes: String(fd.get("notes") || ""), p_company: String(fd.get("company") || ""), p_tax_no: String(fd.get("tax_no") || "") });
  const { redirect } = await import("next/navigation");
  revalidatePath(`/cs/customers/${id}`);
  redirect(`/cs/customers/${id}?${error ? `err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : "ok=1"}`);
}
export async function saveAddress(fd: FormData) {
  await need("cs.agent", "orders.handle");
  const sb = await supabaseServer();
  const id = Number(fd.get("customer"));
  const { error } = await sb.rpc("cs_address_save", {
    p_customer: id, p_id: fd.get("aid") ? Number(fd.get("aid")) : null, p_label: String(fd.get("label") || ""), p_district: fd.get("district") ? Number(fd.get("district")) : null,
    p_address: String(fd.get("address") || ""), p_floor: String(fd.get("floor") || ""), p_apt: String(fd.get("apt") || ""), p_landmark: String(fd.get("landmark") || ""), p_default: fd.get("default") === "1",
  });
  const { redirect } = await import("next/navigation");
  revalidatePath(`/cs/customers/${id}`);
  redirect(`/cs/customers/${id}?${error ? `err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : "ok=1"}`);
}
export async function removeAddress(fd: FormData) {
  await need("cs.agent", "orders.handle");
  const sb = await supabaseServer();
  await sb.rpc("cs_address_off", { p_id: Number(fd.get("aid")) });
  revalidatePath(`/cs/customers/${fd.get("customer")}`);
}
