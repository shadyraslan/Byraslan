import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { sb } from "./supabase";
import type { Address, Config, District, MenuItem, Profile } from "./types";

// التطبيق شغال كزائر: البيانات والعناوين وأرقام الطلبات محفوظة على الموبايل، والطلب بيتبعت بالحي والاسم والموبايل
type Cart = Record<number, number>;
type Ctx = {
  ready: boolean;
  seen: boolean; markSeen: () => void;
  config: Config | null;
  profile: Profile; saveProfile: (p: Partial<Profile>) => void;
  saveAddress: (a: Omit<Address, "id"> & { id?: string }) => void; removeAddress: (id: string) => void;
  district: District | null; setDistrict: (id: number) => void; branch: string | null;
  menu: MenuItem[] | null; loadMenu: () => Promise<void>;
  cart: Cart; add: (m: MenuItem, dir: 1 | -1) => void; setQty: (id: number, q: number) => void; clearCart: () => void;
  tokens: string[]; addToken: (t: string) => void;
  favs: number[]; toggleFav: (id: number) => void;
};
const C = createContext<Ctx | null>(null);
export const useApp = () => useContext(C)!;
export const stepOf = (m: { sold_by: string; unit: string }) => (m.sold_by === "piece" || m.unit === "قطعة" ? 1 : 0.5);
const put = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v)).catch(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [seen, setSeen] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [profile, setProfile] = useState<Profile>({ name: "", phone: "", addresses: [] });
  const [distId, setDistId] = useState<number | null>(null);
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [cart, setCart] = useState<Cart>({});
  const [tokens, setTokens] = useState<string[]>([]);
  const [favs, setFavs] = useState<number[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const v = await AsyncStorage.multiGet(["seen", "district", "cart", "profile", "tokens", "favs"]);
        const g = Object.fromEntries(v.map(([k, x]) => [k, x ? JSON.parse(x) : null]));
        if (g.seen) setSeen(true);
        if (g.district) setDistId(Number(g.district));
        if (g.cart) setCart(g.cart);
        if (g.profile) setProfile(g.profile);
        if (g.tokens) setTokens(g.tokens);
        if (g.favs) setFavs(g.favs);
      } catch {}
      setReady(true);
    })();
    sb.rpc("app_config").then(({ data }) => data && setConfig(data as Config));
  }, []);

  const markSeen = () => { setSeen(true); put("seen", true); };
  const setDistrict = useCallback((id: number) => { setDistId(id); put("district", id); }, []);
  const saveProfile = (p: Partial<Profile>) => setProfile((o) => { const n = { ...o, ...p }; put("profile", n); return n; });
  const saveAddress = (a: Omit<Address, "id"> & { id?: string }) => setProfile((o) => {
    const id = a.id ?? String(Date.now());
    let L = o.addresses.filter((x) => x.id !== id);
    if (a.is_default || !L.length) L = L.map((x) => ({ ...x, is_default: false }));
    L = [...L, { ...a, id, is_default: a.is_default || !L.some((x) => x.is_default) }];
    const n = { ...o, addresses: L }; put("profile", n);
    if (a.is_default || L.length === 1) setDistrict(a.district_id);
    return n;
  });
  const removeAddress = (id: string) => setProfile((o) => { const n = { ...o, addresses: o.addresses.filter((x) => x.id !== id) }; put("profile", n); return n; });

  const district = config?.districts.find((d) => d.id === distId) ?? null;
  const branch = district?.branch ?? null;
  const loadMenu = useCallback(async () => {
    if (!branch) { setMenu(null); return; }
    const { data } = await sb.rpc("app_catalog2", { p_loc: branch });
    setMenu(((data ?? []) as MenuItem[]).map((m) => ({ ...m, price: Number(m.price), old_price: m.old_price == null ? null : Number(m.old_price), pct: Number(m.pct), available: Number(m.available) })));
  }, [branch]);
  useEffect(() => { setMenu(null); loadMenu(); }, [loadMenu]);

  const saveCart = (c: Cart) => { put("cart", c); return c; };
  const add = (m: MenuItem, dir: 1 | -1) => setCart((c) => {
    const q = Math.max(0, Math.round(((c[m.item_id] ?? 0) + dir * stepOf(m)) * 10) / 10);
    const n = { ...c }; if (q) n[m.item_id] = q; else delete n[m.item_id];
    return saveCart(n);
  });
  const setQty = (id: number, q: number) => setCart((c) => { const n = { ...c }; if (q > 0) n[id] = q; else delete n[id]; return saveCart(n); });
  const clearCart = () => setCart(saveCart({}));
  const addToken = (t: string) => setTokens((o) => { const n = [t, ...o.filter((x) => x !== t)].slice(0, 50); put("tokens", n); return n; });
  const toggleFav = (id: number) => setFavs((o) => { const n = o.includes(id) ? o.filter((x) => x !== id) : [...o, id]; put("favs", n); return n; });

  const v = useMemo(() => ({ ready, seen, markSeen, config, profile, saveProfile, saveAddress, removeAddress, district, setDistrict, branch, menu, loadMenu, cart, add, setQty, clearCart, tokens, addToken, favs, toggleFav }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, seen, config, profile, district, setDistrict, branch, menu, loadMenu, cart, tokens, favs]);
  return <C.Provider value={v}>{children}</C.Provider>;
}
