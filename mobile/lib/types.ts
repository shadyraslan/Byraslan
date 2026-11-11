export type District = { id: number; name: string; city: string; branch: string | null; branch_name: string | null; fee: number };
export type Banner = { title: string; subtitle: string | null; badge: string | null; cta: string | null; icon: string | null; bg: string | null; family: string | null };
export type Config = {
  brands: Record<string, string>; note: string | null; test_mode: boolean; open: boolean; min_order: number; first_free: boolean;
  support: { whatsapp?: string; phone?: string; faq?: [string, string][] }; banners: Banner[]; districts: District[]; campaigns?: { id: number; name: string; subtitle: string | null; color: string; ends_at: string }[];
  welcome: { on: boolean; ver: number; title: string; body: string } | null;
};
export type MenuItem = { item_id: number; name: string; unit: string; sold_by: string; price: number; old_price: number | null; pct: number; family: string | null; brand: string; available: number; photo: string | null; icon: string | null; color: string | null };
export type Address = { id: string; label: string; district_id: number; address: string; is_default: boolean; lat?: number; lng?: number };
export type Profile = { name: string; phone: string; addresses: Address[] };
export type OrderLine = { item_id: number; name: string; qty: number; unit: string; icon: string | null; prepared?: number; price?: number };
export type MyOrder = { no: number; token: string; status: string; created_at: string; branch: string; district_id: number | null; total: number; lines: OrderLine[] };
export type Quote = { sub: number; fee: number; discount: number; total: number; offers?: { name: string; amount: number }[]; code_ok: boolean; code_msg: string | null; first_free: boolean; min_order: number; error?: string; points_used?: number; points_off?: number; points_msg?: string | null; points_balance?: number | null; points_earn?: number };
export type Points = { on: boolean; known?: boolean; balance?: number; value?: number; tier?: string; earn_per?: number; point_value?: number; min_redeem?: number; max_pct?: number; vip_mult?: number; expire_months?: number; expiring_30?: number; no_points?: boolean; history?: { kind: string; points: number; at: string; note: string | null }[] };
export type Notice = { id: number; title: string; body: string; at: string };
