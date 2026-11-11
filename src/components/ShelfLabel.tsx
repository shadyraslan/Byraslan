import { barcodeSvg } from "@/lib/barcode";

export type LabelData = { name: string; size?: string | null; maker?: string | null; unit?: string | null; price: number | null; old?: number | null; code?: string | null };
export type OfferInfo = { name: string; color: string; until?: string | null };
const m = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("ar-EG", { maximumFractionDigits: 2 }));
const kg = (u?: string | null) => (u === "كجم" ? " / كجم" : "");

/** ستايل الملصقات (مرة واحدة في الصفحة) — مقاسات بالمللي عشان الطباعة تطلع مظبوطة */
export function LabelStyles() {
  return <style>{`
  .lbl{box-sizing:border-box;border:.2mm solid #ddd;break-inside:avoid;page-break-inside:avoid;font-family:inherit;color:#0D0D0D;background:#fff;overflow:hidden;position:relative;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lbl.shelf{width:70mm;height:38mm;display:grid;grid-template-rows:9mm 1fr 11mm}
  .lbl.sticker{width:40mm;height:26mm;display:grid;grid-template-rows:1fr 9mm;padding:1mm}
  .lbl .bar{background:#0D0D0D;color:#F5C800;display:flex;align-items:center;justify-content:space-between;padding:0 2mm;font-size:2.6mm;font-weight:700}
  .lbl .lg{height:7.6mm;width:auto;display:block}
  .lbl .lgbox{background:#0D0D0D;border-radius:1mm;padding:.3mm .8mm;display:inline-flex}
  .lbl .lgbox .lg{height:5.6mm}
  .lbl .mid{display:flex;justify-content:space-between;align-items:center;padding:1mm 2.5mm;gap:2mm}
  .lbl .nm{font-weight:800;font-size:3.6mm;line-height:1.15;max-height:8.4mm;overflow:hidden}
  .lbl .sub{font-size:2.5mm;color:#666;margin-top:.6mm}
  .lbl .pr{font-weight:900;font-size:9mm;line-height:1;white-space:nowrap;background:#F5C800;padding:1mm 2mm;border-radius:1.5mm}
  .lbl .pr small{font-size:3mm;font-weight:700}
  .lbl .bc{display:flex;align-items:center;justify-content:space-between;padding:0 2.5mm 1mm}
  .lbl .bc svg{height:9mm;width:auto;max-width:42mm}
  .lbl .bc .c{font-size:2.3mm;letter-spacing:.3mm;direction:ltr;color:#444}
  .lbl.offer{border:.6mm solid var(--oc)}
  .lbl.offer .bar{background:var(--oc);color:#fff}
  .lbl.offer .tag{background:#fff;color:var(--oc);border-radius:1mm;padding:0 1.5mm;font-weight:900}
  .lbl.offer .pr{background:var(--oc);color:#fff}
  .lbl .old{font-size:3.6mm;color:#888;text-decoration:line-through;text-align:center;font-weight:700}
  .lbl .save{font-size:2.6mm;font-weight:800;color:var(--oc);text-align:center}
  .lbl.sticker .nm{font-size:2.8mm;text-align:center}
  .lbl.sticker .pr{font-size:5mm;padding:.5mm 1.5mm;justify-self:center}
  .lbl.sticker .top{display:grid;justify-items:center;align-content:center;gap:.6mm}
  .lbl.sticker .bc{padding:0;justify-content:center;flex-direction:column}
  .lbl.sticker .bc svg{height:6mm}
  `}</style>;
}

/** ملصق رف باي رسلان — عادي أو عرض (لون العرض + السعر قبل وبعد) */
export function ShelfLabel({ d, branch, offer }: { d: LabelData; branch?: string; offer?: OfferInfo | null }) {
  const save = offer && d.old && d.price != null && d.old > d.price ? d.old - d.price : 0;
  return (
    <div className={`lbl shelf${offer ? " offer" : ""}`} style={offer ? ({ ["--oc" as string]: offer.color }) : undefined}>
      <div className="bar">
        {offer ? <><span className="tag">عرض</span><span>{offer.name}{offer.until ? ` · لحد ${offer.until}` : ""}</span><span className="lgbox"><img className="lg" src="/logo-label.png" alt="By Raslan" /></span></>
          : <><img className="lg" src="/logo-label.png" alt="By Raslan" /><span style={{ color: "#fff", fontWeight: 500, fontSize: "2.8mm" }}>{branch}</span></>}
      </div>
      <div className="mid">
        <div style={{ minWidth: 0 }}>
          <div className="nm">{d.name}</div>
          <div className="sub">{[d.maker, d.size].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ display: "grid", gap: ".6mm", justifyItems: "center" }}>
          {offer && d.old && d.old !== d.price ? <div className="old">{m(d.old)} ج</div> : null}
          <div className="pr">{m(d.price)}<small> ج{kg(d.unit)}</small></div>
          {save > 0 && <div className="save">وفّر {m(save)} ج</div>}
        </div>
      </div>
      <div className="bc">
        {d.code ? <span dangerouslySetInnerHTML={{ __html: barcodeSvg(d.code, 40, 1) }} /> : <span />}
        <span className="c">{d.code ?? ""}</span>
      </div>
    </div>
  );
}

/** ملصق منتج صغير (للي مالوش باركود من المصنع) */
export function StickerLabel({ d, offer }: { d: LabelData; offer?: OfferInfo | null }) {
  return (
    <div className={`lbl sticker${offer ? " offer" : ""}`} style={offer ? ({ ["--oc" as string]: offer.color }) : undefined}>
      <div className="top">
        <div className="nm">{d.name}{d.size ? ` — ${d.size}` : ""}</div>
        {offer && d.old && d.old !== d.price ? <div className="old" style={{ fontSize: "2.6mm" }}>{m(d.old)} ج</div> : null}
        <div className="pr">{m(d.price)} ج{kg(d.unit)}</div>
      </div>
      <div className="bc">
        {d.code && <span dangerouslySetInnerHTML={{ __html: barcodeSvg(d.code, 40, 1) }} />}
        <span className="c">{d.code ?? ""}</span>
      </div>
    </div>
  );
}
