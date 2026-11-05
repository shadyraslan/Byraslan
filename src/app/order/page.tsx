import { supabaseServer } from "@/lib/supabase/server";
import Shop from "./Shop";

export const metadata = { title: "اطلب من روستوز" };

export default async function OrderPage({ searchParams }: { searchParams: Promise<{ b?: string; ch?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("public_branches");
  const { data: note } = await sb.from("settings").select("value").eq("key", "online.weight_note").maybeSingle();
  const B = ((data ?? []) as { id: string; name: string; fee: number; min_order: number; open: boolean }[]).map((b) => ({ ...b, fee: Number(b.fee), min_order: Number(b.min_order) }));
  return (
    <div className="shop">
      <header className="shophead"><img src="/logo.png" alt="By Raslan" /><b>اطلب أونلاين</b></header>
      <Shop branches={B} initial={sp.b ?? null} channel={sp.ch === "phone" || sp.ch === "whatsapp" ? sp.ch : "web"} note={(note?.value as string) ?? "السعر النهائي بيتحسب بالوزن الفعلي"} />
    </div>
  );
}
