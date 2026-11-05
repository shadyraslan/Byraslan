import { supabaseServer } from "@/lib/supabase/server";

export type Me = { id: string; name: string; isOwner: boolean; perms: Set<string>; home: string | null };

/** المستخدم الحالي وصلاحياته (المالك عنده كل حاجة) */
export async function getMe(): Promise<Me | null> {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const { data: prof } = await sb.from("profiles").select("name,is_owner,active,home_loc").eq("id", user.id).maybeSingle();
  const { data: grants } = await sb
    .from("grants")
    .select("perm,until")
    .eq("user_id", user.id);
  if (prof && prof.active === false) return null;
  const today = new Date().toISOString().slice(0, 10);
  const perms = new Set((grants ?? []).filter((g) => !g.until || g.until >= today).map((g) => g.perm as string));
  return { id: user.id, name: prof?.name ?? user.email ?? "", isOwner: !!prof?.is_owner, perms, home: (prof?.home_loc as string | null) ?? null };
}

export const can = (me: Me | null, perm: string) => !!me && (me.isOwner || me.perms.has(perm));
