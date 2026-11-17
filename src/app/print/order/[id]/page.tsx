import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { barcodeSvg } from "@/lib/barcode";
import PrintBtn from "../../campaign/[id]/PrintBtn";

type L = { name: string; unit: string; sold_by: string; qty: number; prepared: number; price: number; boxes: number };
type R = {
  id: number; no: number; status: string; created_at: string; delivered_at: string | null; pay_method: string;
  address: string | null; floor: string | null; apt: string | null; landmark: string | null; note: string | null; rider_note: string | null;
  district: string | null; branch: string | null; customer: { name: string | null; phone: string } | null; rider: string | null;
  fee: number; fee_orig: number | null; discount: number; promo: string | null; branch_discount: number; points_off: number | null;
  subtotal: number | null; total: number | null; est_total: number; lines: L[]; pays: { method: string; amount: number }[];
  cfg: { thanks?: string; policy?: string; cs_phone?: string; tax_no?: string; cr_no?: string } | null;
};
const PM: [string, string][] = [["cash", "كاش"], ["card", "فيزا"], ["instapay", "إنستاباي"], ["wallet", "محفظة"], ["credit", "آجل"]];
const n2 = (n: number) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** فاتورة طلب الأونلاين — ورق كاشير 80 مم (نفس شكل الفاتورة القديمة، بخانات العنوان الجديدة وتقسيم الدفع) */
export default async function OrderReceipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("order_receipt", { p_id: Number(id) });
  if (!data) notFound();
  const o = data as R;
  const cfg = o.cfg ?? {};
  const lines = o.lines.map((l) => {
    const w = Number(l.prepared) > 0 ? Number(l.prepared) : Number(l.qty);
    return { ...l, w, total: Math.round(w * Number(l.price) * 100) / 100 };
  });
  const sub = o.subtotal != null ? Number(o.subtotal) : lines.reduce((a, l) => a + l.total, 0);
  const disc = Number(o.discount || 0) + Number(o.branch_discount || 0);
  const total = o.total != null ? Number(o.total) : Math.max(sub + Number(o.fee) - disc, 0);
  const paid = o.pays.reduce((a, p) => a + Number(p.amount), 0);
  const used = new Set(o.pays.length ? o.pays.map((p) => p.method) : [o.pay_method === "card" ? "card" : o.pay_method]);
  const date = new Date(o.delivered_at ?? o.created_at).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }).replaceAll("-", "/");
  const row = (k: string, v: string | number | null | undefined) => (
    <div className="kv"><span className="k">{k}</span><span className="v">{v ?? ""}</span></div>
  );
  return (
    <div dir="rtl" className="rc-wrap">
      <style>{`
        @page { size: 80mm auto; margin: 0 }
        body { margin: 0; background: #fff; color: #000 }
        .rc-wrap { font-family: Cairo, Tahoma, sans-serif; display: grid; justify-items: center; padding: 12px 0 }
        .rc { width: 76mm; color: #000; font-size: 11.5px; line-height: 1.45 }
        .blk { background: #000; color: #fff; border-radius: 3px; text-align: center }
        .logo { padding: 10px 0 4px } .logo img { height: 46px }
        .no { font-size: 18px; font-weight: 900; padding: 2px 0 4px; letter-spacing: 1px }
        .c { text-align: center } .b { font-weight: 800 }
        .kv { display: grid; grid-template-columns: 22mm 1fr; gap: 4px; padding: 1px 2mm }
        .k { font-weight: 800 } .v { font-weight: 700 }
        .sep { border-top: 1.5px dashed #000; margin: 5px 0 }
        table { width: 100%; border-collapse: collapse; font-size: 10.5px }
        th { background: #000; color: #fff; padding: 3px 2px; font-weight: 800 }
        td { padding: 3px 2px; border-bottom: 1px dashed #000; vertical-align: top }
        .num { direction: ltr; text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap }
        .tot { display: flex; justify-content: space-between; padding: 2px 2mm; font-weight: 800 }
        .grand { display: flex; justify-content: space-between; padding: 6px 3mm; font-size: 16px; font-weight: 900; margin-top: 4px }
        .pays { display: flex; flex-wrap: wrap; gap: 3px; padding: 4px 2mm }
        .pm { border: 1.5px solid #000; padding: 1px 6px; border-radius: 3px; font-weight: 800 }
        .pm.on { background: #000; color: #fff }
        .foot { padding: 8px 3mm; margin-top: 6px; font-size: 11px; line-height: 1.6 }
        .foot .big { font-size: 14px; font-weight: 900 }
        .bc { display: grid; justify-items: center; padding: 6px 0 0 }
        .noprint { margin-bottom: 10px }
        @media print { .noprint { display: none } .rc-wrap { padding: 0 } }
      `}</style>
      <div className="noprint"><PrintBtn /></div>
      <div className="rc">
        <div className="blk logo"><img src="/logo.png" alt="By Raslan" /><div className="no num" style={{ textAlign: "center" }}>{o.no}</div></div>
        <div className="c b" style={{ marginTop: 4 }}>التاريخ <span className="num">{date}</span>{o.branch ? ` · فرع ${o.branch}` : ""}</div>
        <div className="c b" style={{ textDecoration: "underline", margin: "3px 0" }}>بيانات التوصيل</div>
        {row("الاسم :", o.customer?.name)}
        {row("التليفون :", o.customer?.phone)}
        {row("المنطقة :", o.district)}
        {row("العنوان :", o.address)}
        {row("الدور :", o.floor)}
        {row("الشقة :", o.apt)}
        {row("العلامة المميزة :", o.landmark)}
        {row("الملاحظات :", o.note)}
        {o.rider && row("الطيار :", o.rider)}
        {o.rider_note && row("ملاحظة للطيار :", o.rider_note)}
        <div className="sep" />
        <table>
          <thead><tr><th style={{ textAlign: "right" }}>الصنف</th><th>الوزن</th><th>كمية</th><th>السعر</th><th>إجمالي</th></tr></thead>
          <tbody>{lines.map((l, i) => (
            <tr key={i}>
              <td className="b">{l.name}</td>
              <td className="num">{l.sold_by === "piece" ? "—" : `${n2(l.w)} ${l.unit}`}</td>
              <td className="num">{l.sold_by === "piece" ? l.w : Math.max(Number(l.boxes), 1)}</td>
              <td className="num">{n2(l.price)}</td>
              <td className="num b">{n2(l.total)}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="sep" />
        <div className="tot"><span>إجمالي الأصناف</span><span className="num">{n2(sub)}</span></div>
        {Number(o.discount) > 0 && <div className="tot"><span>خصم{o.promo ? ` (${o.promo})` : ""}</span><span className="num">({n2(o.discount)})</span></div>}
        {Number(o.branch_discount) > 0 && <div className="tot"><span>خصم الفرع</span><span className="num">({n2(o.branch_discount)})</span></div>}
        {Number(o.points_off) > 0 && <div className="tot"><span>خصم النقاط</span><span className="num">({n2(Number(o.points_off))})</span></div>}
        <div className="tot"><span>رسوم التوصيل</span><span className="num">{o.fee_orig != null ? `${n2(0)} (ببلاش)` : n2(o.fee)}</span></div>
        <div className="blk grand"><span>إجمالي المستحق</span><span className="num">{n2(total)}</span></div>
        <div className="b" style={{ padding: "4px 2mm 0" }}>طريقة الدفع</div>
        <div className="pays">{PM.filter(([k]) => k !== "credit" || used.has("credit")).map(([k, l]) => <span key={k} className={used.has(k) ? "pm on" : "pm"}>{l}{o.pays.length > 1 && used.has(k) ? ` ${n2(o.pays.filter((p) => p.method === k).reduce((a, p) => a + Number(p.amount), 0))}` : ""}</span>)}</div>
        <div className="sep" />
        <div className="tot"><span>المدفوع</span><span className="num">{n2(paid || (o.status === "delivered" ? total : 0))}</span></div>
        <div className="tot"><span>الباقي</span><span className="num">{n2(Math.max(total - (paid || (o.status === "delivered" ? total : 0)), 0))}</span></div>
        <div className="bc" dangerouslySetInnerHTML={{ __html: barcodeSvg(String(o.no), 44, 1.3) }} />
        <div className="c b num" style={{ textAlign: "center", letterSpacing: 3 }}>{o.no}</div>
        <div className="blk foot">
          {cfg.thanks && <div className="big">{cfg.thanks}</div>}
          {cfg.policy && <div>{cfg.policy}</div>}
          {cfg.cs_phone && <div className="b">خدمة العملاء <span className="num">{cfg.cs_phone}</span></div>}
          {cfg.tax_no && <div className="b">ملف ضريبي <span className="num">{cfg.tax_no}</span></div>}
          {cfg.cr_no && <div className="b">س ت <span className="num">{cfg.cr_no}</span></div>}
        </div>
      </div>
    </div>
  );
}
