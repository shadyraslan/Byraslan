import { supabaseServer } from "@/lib/supabase/server";

export type Me = { id: string; name: string; isOwner: boolean; perms: Set<string> };

/** المستخدم الحالي وصلاحياته (المالك عنده كل حاجة) */
export async function getMe(): Promise<Me | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("name,is_owner").eq("id", user.id).maybeSingle();
  const { data: grants } = await sb
    .from("grants")
    .select("perm,until")
    .eq("user_id", user.id);
  const today = new Date().toISOString().slice(0, 10);
  const perms = new Set((grants ?? []).filter((g) => !g.until || g.until >= today).map((g) => g.perm as string));
  return { id: user.id, name: prof?.name ?? user.email ?? "", isOwner: !!prof?.is_owner, perms };
}

export const can = (me: Me | null, perm: string) => !!me && (me.isOwner || me.perms.has(perm));
