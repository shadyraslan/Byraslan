import { cache } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { createReqId, startReq, mark, endMark, endReq } from "@/lib/perf";

export type Me = { id: string; name: string; isOwner: boolean; perms: Set<string>; home: string | null };

/** 사용자 현재 정보와 권한 (캐시: 렌더 패스당 한 번). profiles + grants 병렬 조회. */
export const getMe = cache(async function getMe(): Promise<Me | null> {
  const reqId = createReqId();
  const ctx = startReq(reqId, "getMe");
  try {
    const sb = await supabaseServer();
    mark(ctx, "supabase:getMe:auth.getUser");
    const {
      data: { user },
    } = await sb.auth.getUser();
    endMark(ctx, "supabase:getMe:auth.getUser");
    if (!user) return null;
    const today = new Date().toISOString().slice(0, 10);
    mark(ctx, "supabase:getMe:profiles+grants");
    const [{ data: prof }, { data: grants }] = await Promise.all([
      sb.from("profiles").select("name,is_owner,active,home_loc").eq("id", user.id).maybeSingle(),
      sb.from("grants").select("perm,until").eq("user_id", user.id),
    ]);
    endMark(ctx, "supabase:getMe:profiles+grants");
    if (prof && prof.active === false) return null;
    const perms = new Set((grants ?? []).filter((g) => !g.until || g.until >= today).map((g) => g.perm as string));
    return { id: user.id, name: prof?.name ?? user.email ?? "", isOwner: !!prof?.is_owner, perms, home: (prof?.home_loc as string | null) ?? null };
  } finally {
    endReq(ctx);
  }
});

export const can = (me: Me | null, perm: string) => !!me && (me.isOwner || me.perms.has(perm));
