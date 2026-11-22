"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin, staffEmail } from "@/lib/supabase/admin";
import { getMe, can } from "@/lib/perms";
import { ROLES } from "@/lib/roles";
import type { Result } from "@/lib/scan";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

const WORK = ["branch", "outside", "supplier"] as const;
const cleanLogin = (v: string) => v.replace(/\s+/g, " ").trim();

/** اسم الدخول لازم يبقى مش متكرر (من غير فرق كابيتال/مسافات) */
async function loginTaken(login: string, except?: string) {
  const admin = supabaseAdmin()!;
  const { data } = await admin.from("profiles").select("id,login").not("login", "is", null).limit(2000);
  const n = login.toLowerCase();
  return (data ?? []).some((r) => r.id !== except && cleanLogin(String(r.login)).toLowerCase() === n);
}

/** مكان الشغل من الفورم: فرع (home_loc) / خارج الفروع / مورد (supplier_id) */
function workFrom(fd: FormData): { work_place: string; home_loc: string | null; supplier_id: number | null } | string {
  const w = String(fd.get("work_place") || "branch");
  if (!(WORK as readonly string[]).includes(w)) return "اختار مكان الشغل";
  const home = String(fd.get("home_loc") || "") || null;
  const sup = Number(fd.get("supplier_id") || 0) || null;
  if (w === "branch" && !home) return "اختار الفرع اللي بيشتغل فيه";
  if (w === "supplier" && !sup) return "اختار المورد";
  return { work_place: w, home_loc: w === "branch" ? home : null, supplier_id: w === "supplier" ? sup : null };
}

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
  const login = cleanLogin(String(fd.get("login") || "") || name);
  if (name.length < 2) return { ok: false, error: "اكتب اسم الموظف" };
  if (phone && phone.length < 8) return { ok: false, error: "رقم الموبايل مش صحيح (أو سيبه فاضي)" };
  if (login.length < 2 || login.includes("@") || /^[+\d\s-]+$/.test(login)) return { ok: false, error: "اسم المستخدم لازم يبقى اسم (مش أرقام بس ومن غير @)" };
  if (await loginTaken(login)) return { ok: false, error: `اسم المستخدم «${login}» موجود قبل كده — زوّد حرف أو اسم العيلة` };
  const wk = workFrom(fd);
  if (typeof wk === "string") return { ok: false, error: wk };
  const pe = await pinError(pass);
  if (pe) return { ok: false, error: pe };
  // من غير موبايل: إيميل داخلي عشوائي (الدخول بالاسم بس)
  const email = phone ? staffEmail(phone) : `u${randomBytes(6).toString("hex")}@staff.byraslan.app`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true, user_metadata: { name }, app_metadata: { staff: true } });
  if (error || !data.user) return { ok: false, error: error?.message.includes("already") ? "الموبايل ده متسجّل قبل كده" : error?.message ?? "ماتعملش" };
  const id = data.user.id;
  await admin.from("profiles").update({ active: true, name, phone: phone || null, login, job: String(fd.get("job") || "") || null, ...wk }).eq("id", id);
  const role = ROLES.find((r) => r.id === fd.get("role"));
  // المدير مايقدرش يدّي الموظف الجديد صلاحيات مش معاه (المالك بيدّي أي حاجة) — من مراجعة فرع emam
  const perms = role ? role.perms.filter((perm) => me!.isOwner || (perm !== "users.manage" && can(me, perm))) : [];
  if (perms.length) await admin.from("grants").insert(perms.map((perm) => ({ user_id: id, perm, granted_by: me!.id })));
  revalidatePath("/users");
  return { ok: true, name: login };
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

/** تعديل اسم الدخول ومكان الشغل لموظف موجود */
export async function updateStaff(fd: FormData) {
  const me = await getMe();
  const admin = supabaseAdmin();
  if (!can(me, "users.manage")) redirect(`/users?err=${encodeURIComponent("محتاج صلاحية إدارة المستخدمين")}`);
  if (!admin) redirect(`/users?err=${encodeURIComponent(NO_KEY)}`);
  const id = String(fd.get("id"));
  const login = cleanLogin(String(fd.get("login") || ""));
  if (login.length < 2 || login.includes("@") || /^[+\d\s-]+$/.test(login)) redirect(`/users?err=${encodeURIComponent("اسم المستخدم لازم يبقى اسم (مش أرقام بس ومن غير @)")}`);
  if (await loginTaken(login, id)) redirect(`/users?err=${encodeURIComponent(`اسم المستخدم «${login}» موجود قبل كده`)}`);
  const wk = workFrom(fd);
  if (typeof wk === "string") redirect(`/users?err=${encodeURIComponent(wk)}`);
  const { error } = await admin.from("profiles").update({ login, ...wk }).eq("id", id);
  if (error) redirect(`/users?err=${encodeURIComponent(error.message)}`);
  revalidatePath("/users");
  redirect(`/users?ok=${encodeURIComponent(`اتحفظ — يدخل بـ «${login}»`)}`);
}

const BACK = "as_back";
const AS = "as_name";

/** «جرّب كأنه هو»: المالك يدخل بحساب الموظف عشان يشوف السيستم بصلاحياته — وزرار «ارجع لحسابي» بيرجّعه من غير رقم سري */
export async function viewAs(fd: FormData) {
  const me = await getMe();
  const admin = supabaseAdmin();
  if (!me?.isOwner) redirect(`/users?err=${encodeURIComponent("الميزة دي للمالك بس")}`);
  if (!admin) redirect(`/users?err=${encodeURIComponent(NO_KEY)}`);
  const id = String(fd.get("id"));
  const { data: p } = await admin.from("profiles").select("name,is_owner,active").eq("id", id).maybeSingle();
  if (!p || p.is_owner || p.active === false) redirect(`/users?err=${encodeURIComponent("مينفعش تدخل بالحساب ده")}`);
  const { data: u } = await admin.auth.admin.getUserById(id);
  const email = u.user?.email;
  if (!email) redirect(`/users?err=${encodeURIComponent("الحساب مالوش دخول")}`);
  const sb = await supabaseServer();
  const { data: cur } = await sb.auth.getSession();
  const back = cur.session?.refresh_token;
  if (!back) redirect("/login");
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) redirect(`/users?err=${encodeURIComponent("ماقدرناش ندخل بالحساب — جرّب تاني")}`);
  const jar = await cookies();
  const opt = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 8 };
  jar.set(BACK, back, opt);
  jar.set(AS, encodeURIComponent(String(p.name)), opt);
  const { error: ve } = await sb.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (ve) { jar.delete(BACK); jar.delete(AS); redirect(`/users?err=${encodeURIComponent("ماقدرناش ندخل بالحساب — جرّب تاني")}`); }
  await admin.from("audit_log").insert({ by: me.id, tbl: "profiles", row_id: id, action: "view_as" });
  redirect("/dashboard");
}

export async function backToMe() {
  const jar = await cookies();
  const back = jar.get(BACK)?.value;
  jar.delete(BACK);
  jar.delete(AS);
  const sb = await supabaseServer();
  if (back) {
    const { error } = await sb.auth.refreshSession({ refresh_token: back });
    if (!error) redirect("/users");
  }
  await sb.auth.signOut();
  redirect("/login");
}
