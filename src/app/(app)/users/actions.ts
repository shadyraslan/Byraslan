"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";

export async function grant(fd: FormData) {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const amt = String(fd.get("max_amount") || "").trim();
  await sb.from("grants").upsert({
    user_id: String(fd.get("user_id")),
    perm: String(fd.get("perm")),
    until: String(fd.get("until") || "") || null,
    max_amount: amt ? Number(amt) : null,
    granted_by: user?.id ?? null,
  });
  revalidatePath("/users");
}

export async function revoke(fd: FormData) {
  const sb = await supabaseServer();
  await sb.from("grants").delete().eq("user_id", String(fd.get("user_id"))).eq("perm", String(fd.get("perm")));
  revalidatePath("/users");
}
