import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { sb } from "./supabase";

export type Home = {
  name: string; job: string | null; home: string | null; home_name: string | null;
  policy: { ver: number; text: string } | null; policy_ok: boolean; selfie: boolean;
  state: "in" | "out"; last: { kind: string; at: string; status: string; loc: string | null } | null;
  today: { kind: string; at: string; status: string; flags: string[] }[]; unread: number; is_driver: boolean; is_manager?: boolean;
  shift_today?: { off: boolean; start: string | null; end: string | null } | null; shift_tomorrow?: { off: boolean; start: string | null; end: string | null } | null;
};
export function useHome() {
  const [h, setH] = useState<Home | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await sb.rpc("staff_home");
    if (error) setErr(error.message.replace(/^.*?ERROR:\s*/, "")); else { setH(data as Home); setErr(null); }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { h, err, load };
}
