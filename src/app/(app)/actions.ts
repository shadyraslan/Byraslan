"use server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut({ scope: "local" });
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  jar.delete("as_back");
  jar.delete("as_name");
  redirect("/login");
}
