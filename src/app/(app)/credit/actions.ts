"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { need } from "@/lib/perms";

const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");
function back(error: { message?: string } | null, ok: string): never {
  revalidatePath("/credit");
  redirect(`/credit?${error ? `err=${encodeURIComponent(msg(error))}` : `ok=${encodeURIComponent(ok)}`}`);
}

/** فتح حساب آجل أو تعديله — الحد محكوم بصلاحية credit.open */
export async function openCredit(fd: FormData) {
  await need("credit.open");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("credit_open", {
    p_phone: S(fd, "phone"), p_name: S(fd, "name"), p_company: S(fd, "company"), p_tax: S(fd, "tax"),
    p_limit: Number(S(fd, "limit") || 0), p_days: Number(S(fd, "days") || 30), p_tier: S(fd, "tier") || "wholesale",
    p_active: fd.get("active") !== "off", p_note: S(fd, "note"),
  });
  back(error, "اتحفظ الحساب");
}

export async function collect(fd: FormData) {
  await need("credit.collect");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("credit_pay", { p_cust: Number(S(fd, "cust")), p_amount: Number(S(fd, "amount")), p_method: S(fd, "method"), p_ref: S(fd, "ref"), p_loc: S(fd, "loc") || null, p_note: S(fd, "note") });
  back(error, `اتسجّل التحصيل CR-${data}`);
}

export async function adjust(fd: FormData) {
  await need("credit.open");
  const sb = await supabaseServer();
  const sign = S(fd, "sign") === "minus" ? -1 : 1;
  const { error } = await sb.rpc("credit_adjust", { p_cust: Number(S(fd, "cust")), p_amount: sign * Number(S(fd, "amount")), p_note: S(fd, "note") });
  back(error, "اتسجّلت التسوية");
}

export async function saveCreditCfg(fd: FormData) {
  await need("settings.edit");
  const sb = await supabaseServer();
  const { error } = await sb.from("settings").upsert({ key: "credit", value: { block_overdue: fd.get("block") === "on", grace_days: Math.max(Number(S(fd, "grace") || 0), 0), default_days: Math.max(Number(S(fd, "ddays") || 30), 0) }, updated_at: new Date().toISOString() });
  back(error, "اتحفظت الإعدادات");
}
