import { supabaseServer } from "@/lib/supabase/server";
import Shop, { type Init } from "./Shop";

export const metadata = { title: "اطلب من روستوز" };

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ ch?: string; c?: string; edit?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("app_config");
  const { data: bk } = await sb.from("settings").select("value").eq("key", "booking").maybeSingle();
  const bcfg = (bk?.value ?? {}) as { on?: boolean; days_ahead?: number };
  const cfg = (data ?? {}) as { note?: string; open?: boolean; min_order?: number; districts?: { id: number; name: string; city: string; branch: string | null; branch_name: string | null; fee: number }[] };
  const D = (cfg.districts ?? []).map((d) => ({ ...d, id: Number(d.id), fee: Number(d.fee) }));
  // لينك سلة جاهزة من خدمة العملاء
  let init: Init | undefined;
  if (sp.c) {
    const { data: c } = await sb.rpc("public_cart", { p_id: sp.c.slice(0, 20) });
    const x = c as { district_id: number | null; items: { item_id: number; qty: number }[]; phone: string | null; name: string | null; address: string | null } | null;
    if (x) init = { district: x.district_id, cart: Object.fromEntries(x.items.map((i) => [i.item_id, Number(i.qty)])), info: { name: x.name ?? "", phone: x.phone ?? "", address: x.address ?? "" } };
  }
  // تعديل حجز: الأصناف الحالية في السلة
  if (sp.edit) {
    const { data: t } = await sb.rpc("track_order", { p_token: sp.edit.slice(0, 64) });
    const o = t as { no: number; status?: string; booking?: boolean; can_edit?: boolean; scheduled_for?: string; slot?: string; district_id?: number; address?: string; lines?: { item_id: number; qty: number }[] } | null;
    if (o?.booking && ['new', 'accepted'].includes(o.status ?? '')) init = {
      district: o.district_id ?? null, cart: Object.fromEntries((o.lines ?? []).map((l) => [l.item_id, Number(l.qty)])), info: { address: o.address ?? "" },
      edit: { token: sp.edit, no: o.no, date: new Date(o.scheduled_for!).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }), slot: o.slot ?? "" },
    };
  }
  return (
    <div className="shop">
      <header className="shophead"><img src="/logo.png" alt="By Raslan" /><b>اطلب أونلاين</b><a href="/help" style={{ marginInlineStart: "auto", color: "inherit", fontSize: 14 }}>💬 خدمة العملاء</a></header>
      <Shop districts={D} open={cfg.open !== false} minOrder={Number(cfg.min_order ?? 0)} channel={sp.ch === "phone" || sp.ch === "whatsapp" ? sp.ch : "web"} note={cfg.note ?? "السعر النهائي بيتحسب بالوزن الفعلي"} init={init} booking={{ on: bcfg.on !== false, days: Number(bcfg.days_ahead ?? 14) }} />
    </div>
  );
}
