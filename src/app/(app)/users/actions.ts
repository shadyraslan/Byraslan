"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

export async function grant(fd: FormData) {
  const me = await getMe();
  if (!can(me, "users.manage")) throw new Error("ليس لديك صلاحية إدارة المستخدمين");
  if (!me) throw new Error("يجب تسجيل الدخول");

  const targetId = String(fd.get("user_id"));
  const perm = String(fd.get("perm"));

  // BUG-005 FIX: التحقق من إن المستخدم مش بيمنح لنفسه
  if (targetId === me.id) {
    throw new Error("ممنوع تمنح صلاحية لنفسك");
  }

  const sb = await supabaseServer();
  const amt = String(fd.get("max_amount") || "").trim();
  const until = String(fd.get("until") || "").trim() || null;

  // استخدام secure_grant() RPC للتحقق من قواعد delegation في الداتابيز
  const { error } = await sb.rpc("secure_grant", {
    p_target: targetId,
    p_perm: perm,
    p_until: until,
    p_max_amount: amt ? Number(amt) : null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/users");
}

export async function revoke(fd: FormData) {
  const me = await getMe();
  if (!can(me, "users.manage")) throw new Error("ليس لديك صلاحية إدارة المستخدمين");
  if (!me) throw new Error("يجب تسجيل الدخول");

  const targetId = String(fd.get("user_id"));

  // حماية: ممنوع تسحب صلاحيات نفسك
  if (targetId === me.id) {
    throw new Error("ممنوع تسحب صلاحيات نفسك");
  }

  const sb = await supabaseServer();
  const { error } = await sb
    .from("grants")
    .delete()
    .eq("user_id", targetId)
    .eq("perm", String(fd.get("perm")));

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/users");
}
