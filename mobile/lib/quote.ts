import { useEffect, useState } from "react";
import { sb } from "./supabase";
import { useApp } from "./store";
import type { Quote } from "./types";

/** حساب السلة من السيستم: سعر الصنف بعد العروض، والتوصيل (ومجاني لأول طلب)، وكود الخصم */
export function useQuote(code: string) {
  const { district, cart, profile } = useApp();
  const [q, setQ] = useState<Quote | null>(null);
  const key = JSON.stringify(cart) + (district?.id ?? "") + code + profile.phone;
  useEffect(() => {
    if (!district?.branch) { setQ(null); return; }
    const lines = Object.entries(cart).map(([id, qty]) => ({ item_id: Number(id), qty }));
    let alive = true;
    sb.rpc("app_quote", { p_district: district.id, p_phone: profile.phone, p_lines: lines, p_code: code || null }).then(({ data }) => { if (alive && data) setQ(data as Quote); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return q;
}
