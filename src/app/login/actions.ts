"use server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin, staffEmail } from "@/lib/supabase/admin";

/** الدخول: بالإيميل، أو بالموبايل، أو باسم المستخدم (اسم الموظف) — الاسم بيتحوّل لحسابه هنا على السيرفر من غير ما نكشف أي بيانات */
export async function signIn(id: string, password: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const bad = { ok: false as const, error: "اسم المستخدم/الموبايل أو الرقم السري غلط" };
  const v = id.trim();
  if (!v || !password) return bad;
  let email: string | null = null;
  if (v.includes("@")) email = v;
  else if (/^[+\d\s-]+$/.test(v)) email = staffEmail(v);
  else {
    const admin = supabaseAdmin();
    if (!admin) return bad;
    const norm = v.replace(/\s+/g, " ").toLowerCase();
    const { data: rows } = await admin.from("profiles").select("id,login,active").not("login", "is", null).limit(2000);
    const p = (rows ?? []).find((r) => String(r.login).replace(/\s+/g, " ").trim().toLowerCase() === norm);
    if (!p || p.active === false) return bad;
    const { data: u } = await admin.auth.admin.getUserById(p.id as string);
    email = u.user?.email ?? null;
    if (!email) return bad;
  }
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? bad : { ok: true };
}
