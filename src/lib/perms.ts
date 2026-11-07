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

/** حماية على السيرفر لكل حركة: لازم يكون موظف داخل، ومعاه صلاحية من اللي مكتوبة (فاضي = أي موظف). قاعدة البيانات بتتأكد تاني. */
export async function need(...perms: string[]): Promise<Me> {
  const me = await getMe();
  if (!me) throw new Error("سجّل دخول الأول");
  if (perms.length && !perms.some((p) => can(me, p))) throw new Error("مش معاك صلاحية للحركة دي");
  return me;
}
/** نفس need بس بيرجّع رسالة بدل ما يوقف الصفحة — للحركات اللي بترجّع Result */
export async function deny(...perms: string[]): Promise<{ ok: false; error: string } | null> {
  try { await need(...perms); return null; } catch (e) { return { ok: false, error: (e as Error).message }; }
}
