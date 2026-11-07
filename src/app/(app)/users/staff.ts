"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin, staffEmail } from "@/lib/supabase/admin";
import { getMe, can } from "@/lib/perms";
import { ROLES } from "@/lib/roles";
import type { Result } from "@/lib/scan";
import { redirect } from "next/navigation";

/** الرقم السري: أقل طول من الداشبورد (auth.pin_min)، ومفيش أرقام سهلة زي 123456 أو 111111 */
async function pinError(pass: string): Promise<string | null> {
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("value").eq("key", "auth.pin_min").maybeSingle();
  const min = Math.max(4, Number(data?.value ?? 6) || 6);
  if (pass.length < min) return `الرقم السري لازم ${min} أرقام أو حروف على الأقل`;
  const d = pass.split("");
  const same = d.every((c) => c === d[0]);
  const seq = (k: number) => d.every((c, i) => i === 0 || c.charCodeAt(0) - d[i - 1].charCodeAt(0) === k);
  if (same || seq(1) || seq(-1) || ["password", "12345678", "11223344"].includes(pass.toLowerCase())) return "الرقم السري سهل جدًا — اختار أرقام مش متسلسلة ومش متكررة";
  return null;
}

const NO_KEY = "لسه مفتاح Supabase السري مش متحط في Vercel (SUPABASE_SERVICE_ROLE_KEY)";

export async function createStaff(_: unknown, fd: FormData): Promise<Result<{ name: string }> | null> {
  const me = await getMe();
  if (!can(me, "users.manage")) return { ok: false, error: "محتاج صلاحية إدارة المستخدمين" };
  const admin = supabaseAdmin();
  if (!admin) return { ok: false, error: NO_KEY };
  const name = String(fd.get("name") || "").trim();
  const phone = String(fd.get("phone") || "").replace(/\D/g, "");
  const pass = String(fd.get("password") || "");
  if (name.length < 2) return { ok: false, error: "اكتب اسم الموظف" };
  if (phone.length < 8) return { ok: false, error: "اكتب رقم موبايل صحيح" };
  const pe = await pinError(pass);
  if (pe) return { ok: false, error: pe };
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail(phone), password: pass, email_confirm: true, user_metadata: { name }, app_metadata: { staff: true } });
  if (error || !data.user) return { ok: false, error: error?.message.includes("already") ? "الموبايل ده متسجّل قبل كده" : error?.message ?? "ماتعملش" };
  const id = data.user.id;
  const home = String(fd.get("home_loc") || "") || null;
  await admin.from("profiles").update({ active: true, name, phone, login: phone, job: String(fd.get("job") || "") || null, home_loc: home }).eq("id", id);
  const role = ROLES.find((r) => r.id === fd.get("role"));
  if (role) await admin.from("grants").insert(role.perms.map((perm) => ({ user_id: id, perm, granted_by: me!.id })));
  revalidatePath("/users");
  return { ok: true, name };
}

export async function resetStaffPassword(fd: FormData) {
  const me = await getMe();
  const admin = supabaseAdmin();
  if (!can(me, "users.manage") || !admin) return;
  const pass = String(fd.get("password") || "");
  const pe = await pinError(pass);
  if (pe) redirect(`/users?err=${encodeURIComponent(pe)}`);
  await admin.auth.admin.updateUserById(String(fd.get("id")), { password: pass });
  revalidatePath("/users");
  redirect(`/users?ok=${encodeURIComponent("اتغيّر الرقم السري")}`);
}

export async function setStaffActive(fd: FormData) {
  const me = await getMe();
  const admin = supabaseAdmin();
  if (!can(me, "users.manage") || !admin) return;
  const id = String(fd.get("id"));
  if (id === me!.id) return;
  const active = fd.get("active") === "1";
  await admin.auth.admin.updateUserById(id, { ban_duration: active ? "none" : "876000h" });
  const sb = await supabaseServer();
  await sb.from("profiles").update({ active }).eq("id", id);
  revalidatePath("/users");
}
