import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { LabelStyles, OfferLabel, StickerLabel } from "@/components/ShelfLabel";
import PrintBtn from "./PrintBtn";

type It = { item_id: number; name: string; size: string | null; maker: string | null; unit: string; price: number; old: number | null; code: string | null };
type V = { campaign: { id: number; name: string; color: string; ends_at: string; locations: string[] | null }; loc: string; items: It[] };

/** ملف ملصقات المهرجان: صفحات A4 جاهزة للطباعة أو "حفظ PDF" — لكل فرع بأسعاره */
export default async function PrintCampaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ loc?: string; kind?: string; n?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("campaign_view", { p_id: Number(id), p_loc: sp.loc || null });
  if (error || !data) notFound();
  const v = data as V, c = v.campaign;
  const { data: locs } = await sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort");
  const L = (locs ?? []).filter((l) => !c.locations?.length || c.locations.includes(l.id));
  const until = new Date(c.ends_at).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric" });
  const n = Math.max(1, Number(sp.n ?? 1)), kind = sp.kind === "sticker" ? "sticker" : "shelf";
  return (
    <div dir="rtl" style={{ padding: 12, background: "#fff", minHeight: "100vh" }}>
      <LabelStyles />
      <style>{`@media print { .noprint { display: none !important } @page { size: A4; margin: 6mm } } .sheet { display: flex; flex-wrap: wrap; gap: 3mm }`}</style>
      <form className="noprint" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end", marginBottom: 12, fontFamily: "inherit" }}>
        <b style={{ fontSize: 18 }}>ملصقات: {c.name}</b>
        <label>الفرع <select name="loc" defaultValue={v.loc}>{L.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label>الشكل <select name="kind" defaultValue={kind}><option value="shelf">ملصق رف (96×32)</option><option value="sticker">ملصق منتج</option></select></label>
        <label>نسخ لكل صنف <input name="n" type="number" min={1} defaultValue={n} style={{ width: 60 }} /></label>
        <button>اعرض</button>
        <PrintBtn />
        <span style={{ color: "#666" }}>{v.items.length * n} ملصق — للحفظ PDF اختار "Save as PDF" من نافذة الطباعة</span>
      </form>
      <div className="sheet">
        {v.items.flatMap((it) => Array.from({ length: n }, (_, k) => {
          const d = { ...it, price: Number(it.price), old: it.old != null ? Number(it.old) : null };
          return kind === "shelf" ? <OfferLabel key={`${it.item_id}-${k}`} d={d} offer={{ name: c.name, color: c.color, until }} /> : <StickerLabel key={`${it.item_id}-${k}`} d={d} offer={{ name: c.name, color: c.color, until }} />;
        }))}
      </div>
    </div>
  );
}
