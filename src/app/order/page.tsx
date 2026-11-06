import { supabaseServer } from "@/lib/supabase/server";
import Shop from "./Shop";

export const metadata = { title: "اطلب من روستوز" };

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ ch?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("app_config");
  const cfg = (data ?? {}) as { note?: string; open?: boolean; min_order?: number; districts?: { id: number; name: string; city: string; branch: string | null; branch_name: string | null; fee: number }[] };
  const D = (cfg.districts ?? []).map((d) => ({ ...d, id: Number(d.id), fee: Number(d.fee) }));
  return (
    <div className="shop">
      <header className="shophead"><img src="/logo.png" alt="By Raslan" /><b>اطلب أونلاين</b></header>
      <Shop districts={D} open={cfg.open !== false} minOrder={Number(cfg.min_order ?? 0)} channel={sp.ch === "phone" || sp.ch === "whatsapp" ? sp.ch : "web"} note={cfg.note ?? "السعر النهائي بيتحسب بالوزن الفعلي"} />
    </div>
  );
}
