import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";

export type Me = { id: string; name: string; isOwner: boolean; perms: Set<string>; home: string | null; mustChange?: boolean };

/** المستخدم الحالي وصلاحياته (المالك عنده كل حاجة).
 *  متخزّن مرة واحدة لكل طلب (cache) والبروفايل والصلاحيات بيتجابوا مع بعض — من مراجعة فرع emam (BUG-018).
 *  المالك عمره ما يتقفل حتى لو حد علّمه موقوف (BUG-003). */
export const getMe = cache(async (): Promise<Me | null> => {
  const sb = await supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const [{ data: prof }, { data: grants }] = await Promise.all([
    sb.from("profiles").select("name,is_owner,active,home_loc,must_change").eq("id", user.id).maybeSingle(),
    sb.from("grants").select("perm,until").eq("user_id", user.id),
  ]);
  if (prof && prof.active === false && !prof.is_owner) return null;
  const today = new Date().toISOString().slice(0, 10);
  const perms = new Set<string>((grants ?? []).filter((g) => !g.until || g.until >= today).map((g) => g.perm as string));
  return { id: user.id, name: prof?.name ?? user.email ?? "", isOwner: !!prof?.is_owner, perms, home: (prof?.home_loc as string | null) ?? null, mustChange: !!prof?.must_change };
});

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
