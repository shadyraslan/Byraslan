import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sb } from "./supabase";
import type { Config, District, MenuItem, Me } from "./types";
import { registerPush } from "./push";

type Cart = Record<number, number>;
type Ctx = {
  session: Session | null;
  ready: boolean;
  config: Config | null;
  me: Me | null;
  refreshMe: () => Promise<void>;
  district: District | null;
  setDistrict: (id: number) => void;
  branch: string | null;
  menu: MenuItem[] | null;
  loadMenu: () => Promise<void>;
  cart: Cart;
  add: (m: MenuItem, dir: 1 | -1) => void;
  setQty: (id: number, q: number) => void;
  clearCart: () => void;
};
const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;
export const stepOf = (m: { sold_by: string; unit: string }) => (m.sold_by === "piece" || m.unit === "قطعة" ? 1 : 0.5);

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [distId, setDistId] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [cart, setCart] = useState<Cart>({});

  useEffect(() => {
    (async () => {
      try {
        const [d, c] = await Promise.all([AsyncStorage.getItem("district"), AsyncStorage.getItem("cart")]);
        if (d) setDistId(Number(d));
        if (c) setCart(JSON.parse(c));
      } catch {}
      const { data } = await sb.auth.getSession();
      setSession(data.session);
      setReady(true);
    })();
    sb.rpc("app_config").then(({ data }) => data && setConfig(data as Config));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const setDistrict = useCallback((id: number) => {
    setDistId(id);
    AsyncStorage.setItem("district", String(id)).catch(() => {});
  }, []);

  const refreshMe = useCallback(async () => {
    if (!session) { setMe(null); return; }
    const { data } = await sb.rpc("app_me");
    if (data) {
      const m = data as Me;
      setMe(m);
      const def = m.addresses.find((a) => a.is_default) ?? m.addresses[0];
      if (def?.district_id) setDistrict(def.district_id);
    }
  }, [session, setDistrict]);

  useEffect(() => {
    refreshMe();
    if (session) registerPush().catch(() => {});
  }, [session, refreshMe]);

  const district = config?.districts.find((d) => d.id === distId) ?? null;
  const branch = district?.branch ?? null;

  const loadMenu = useCallback(async () => {
    if (!branch) { setMenu(null); return; }
    const { data } = await sb.rpc("app_catalog", { p_loc: branch });
    setMenu(((data ?? []) as MenuItem[]).map((m) => ({ ...m, price: Number(m.price), available: Number(m.available) })));
  }, [branch]);
  useEffect(() => { setMenu(null); loadMenu(); }, [loadMenu]);

  const save = (c: Cart) => { AsyncStorage.setItem("cart", JSON.stringify(c)).catch(() => {}); return c; };
  const add = (m: MenuItem, dir: 1 | -1) =>
    setCart((c) => {
      const q = Math.max(0, Math.round(((c[m.item_id] ?? 0) + dir * stepOf(m)) * 10) / 10);
      const n = { ...c };
      if (q) n[m.item_id] = q; else delete n[m.item_id];
      return save(n);
    });
  const setQty = (id: number, q: number) => setCart((c) => { const n = { ...c }; if (q > 0) n[id] = q; else delete n[id]; return save(n); });
  const clearCart = () => setCart(save({}));

  const v = useMemo(() => ({ session, ready, config, me, refreshMe, district, setDistrict, branch, menu, loadMenu, cart, add, setQty, clearCart }),
    [session, ready, config, me, refreshMe, district, setDistrict, branch, menu, loadMenu, cart]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
