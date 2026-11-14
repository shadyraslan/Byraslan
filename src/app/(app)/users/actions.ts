"use server";
import { need } from "@/lib/perms";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");

/** المنح والسحب من خلال secure_grant / secure_revoke في الداتابيز:
 *  ممنوع لنفسك، ممنوع للمالك، إدارة المستخدمين للمالك بس، ومفيش صلاحية أو حد أكبر من اللي معاك */
export async function grant(fd: FormData) {
  await need("users.manage");
  const sb = await supabaseServer();
  const amt = String(fd.get("max_amount") || "").trim();
  const { error } = await sb.rpc("secure_grant", {
    p_target: String(fd.get("user_id")),
    p_perm: String(fd.get("perm")),
    p_until: String(fd.get("until") || "").trim() || null,
    p_max_amount: amt ? Number(amt) : null,
  });
  revalidatePath("/users");
  if (error) redirect(`/users?err=${encodeURIComponent(msg(error))}`);
}

export async function revoke(fd: FormData) {
  await need("users.manage");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("secure_revoke", { p_target: String(fd.get("user_id")), p_perm: String(fd.get("perm")) });
  revalidatePath("/users");
  if (error) redirect(`/users?err=${encodeURIComponent(msg(error))}`);
}
