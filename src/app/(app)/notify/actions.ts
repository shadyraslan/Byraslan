"use server";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { dbMsg } from "@/lib/scan";

export async function send(_: unknown, fd: FormData): Promise<{ ok: boolean; t: string }> {
  const sb = await supabaseServer();
  const app = String(fd.get("app"));
  const target = String(fd.get("target") || "all");
  const { data, error } = await sb.rpc("notify_send", {
    p_app: app, p_target: target,
    p_district: target === "district" ? Number(fd.get("district")) || null : null,
    p_loc: target === "branch" || target === "loc" ? String(fd.get("loc") || "") || null : null,
    p_phone: target === "phone" ? String(fd.get("phone") || "") : null,
    p_user: target === "user" ? String(fd.get("user") || "") || null : null,
    p_title: String(fd.get("title") || ""), p_body: String(fd.get("body") || ""), p_ack: fd.get("ack") === "on",
  });
  if (error) return { ok: false, t: dbMsg(error.message) };
  revalidatePath("/notify");
  const n = (data as { devices: number | null }).devices;
  return { ok: true, t: app === "customer" ? `اتبعتت — في صندوق الإشعارات في التطبيق${n ? ` ووصلت ${n} موبايل` : ""}` : "اتبعتت — في رسايل الإدارة في تطبيق الموظفين" };
}

export async function saveWelcome(fd: FormData) {
  const sb = await supabaseServer();
  const key = String(fd.get("key"));
  const { data: old } = await sb.from("settings").select("value").eq("key", key).maybeSingle();
  const o = (old?.value ?? {}) as { ver?: number; title?: string; body?: string };
  const title = String(fd.get("title") || "").trim(), body = String(fd.get("body") || "").trim();
  const changed = title !== o.title || body !== o.body;
  // أي تعديل في النص = نسخة جديدة، فبتظهر تاني لكل الناس
  await sb.from("settings").upsert({ key, value: { on: fd.get("on") === "on", ver: (o.ver ?? 0) + (changed ? 1 : 0), title, body }, updated_at: new Date().toISOString() });
  revalidatePath("/notify");
}
