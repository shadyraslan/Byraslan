export type Branch = { id: string; name: string; fee: number; min_order: number; open: boolean };
export type Config = { brands: Record<string, string>; note: string | null; test_mode: boolean; branches: Branch[] };
export type MenuItem = { item_id: number; name: string; unit: string; sold_by: string; price: number; family: string | null; brand: string; available: number };
export type Address = { id: number; label: string; area: string | null; address: string; location_id: string | null; is_default: boolean };
export type Me = { id: number; name: string; phone: string; addresses: Address[] };
export type MyOrder = { no: number; token: string; status: string; created_at: string; branch: string; location_id: string; total: number; lines: { item_id: number; name: string; qty: number; unit: string }[] };
