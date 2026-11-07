"use server";
import { need } from "@/lib/perms";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** بداية جرد جديد ← يفتح شاشة العدّ على طول */
export async function startCount(fd: FormData) {
  await need("stock.count", "stock.adjust");
  const sb = await supabaseServer();
  const fam = String(fd.get("family") || "");
  const { data, error } = await sb.rpc("count_start", { p_loc: String(fd.get("loc")), p_family: fam ? Number(fam) : null, p_note: String(fd.get("note") || "") });
  if (error) redirect(`/stock/count?err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}`);
  redirect(`/stock/count/${data}`);
}
