import { useCallback, useEffect, useState } from "react";
import { sb } from "./supabase";

export type Track = {
  no: number; status: string; branch: string; est_total: number; total: number | null; fee: number; discount: number;
  created_at: string; accepted_at: string | null; ready_at: string | null; out_at: string | null; delivered_at: string | null;
  driver: string | null; address: string | null; pay: string; cancel_reason: string | null;
  booking?: boolean; scheduled_for?: string | null; slot?: string | null; deposit?: number; deposit_paid?: boolean; can_edit?: boolean;
  lines: { item_id: number; name: string; unit: string; qty: number; prepared: number; price: number; icon: string | null }[];
  points_used?: number; points_off?: number; points_earned?: number | null; sub_pref?: string;
  subs?: { line: number; name: string; sub_name: string | null; sub_qty: number; sub_price: number; status: string; deadline: string | null; unit: string | null }[] | null;
};
export function useTrack(token: string, every = 15000) {
  const [o, setO] = useState<Track | null>(null);
  const load = useCallback(async () => { const { data } = await sb.rpc("track_order", { p_token: token }); if (data) setO(data as Track); }, [token]);
  useEffect(() => { load(); const t = setInterval(load, every); return () => clearInterval(t); }, [load, every]);
  return { o, load };
}
export const hhmm = (s: string | null) => (s ? new Date(s).toLocaleTimeString("ar-EG", { hour: "numeric", minute: "2-digit" }) : "");
export const lineTotal = (l: Track["lines"][number]) => (l.prepared > 0 ? l.prepared : l.qty) * l.price;
export const orderTotal = (o: Track) => (o.total != null ? Number(o.total) : o.lines.reduce((a, l) => a + lineTotal(l), 0) + Number(o.fee) - Number(o.discount));
