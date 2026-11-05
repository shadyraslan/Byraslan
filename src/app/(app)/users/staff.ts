"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin, staffEmail } from "@/lib/supabase/admin";
import { getMe, can } from "@/lib/perms";
import { ROLES } from "@/lib/roles";
import type { Result } from "@/lib/scan";

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
  if (pass.length < 6) return { ok: false, error: "الرقم السري لازم 6 أرقام أو حروف على الأقل" };
  const { data, error } = await admin.auth.admin.createUser({ email: staffEmail(phone), password: pass, email_confirm: true, user_metadata: { name }, app_metadata: { staff: true } });
  if (error || !data.user) return { ok: false, error: error?.message.includes("already") ? "الموبايل ده متسجّل قبل كده" : error?.message ?? "ماتعملش" };
  const id = data.user.id;
  const home = String(fd.get("home_loc") || "") || null;
  await admin.from("profiles").update({ name, phone, login: phone, job: String(fd.get("job") || "") || null, home_loc: home }).eq("id", id);
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
  if (pass.length < 6) return;
  await admin.auth.admin.updateUserById(String(fd.get("id")), { password: pass });
  revalidatePath("/users");
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
