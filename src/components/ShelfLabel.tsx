import { barcodeSvg } from "@/lib/barcode";

export type LabelData = { name: string; size?: string | null; maker?: string | null; unit?: string | null; price: number | null; old?: number | null; code?: string | null };
export type OfferInfo = { name: string; color: string; until?: string | null };
const m = (n: number | null | undefined) => (n == null ? "" : Number(n).toLocaleString("ar-EG", { maximumFractionDigits: 2 }));
const kg = (u?: string | null) => (u === "كجم" ? " / كجم" : "");

/** ستايل الملصقات (مرة واحدة في الصفحة) — مقاسات بالمللي عشان الطباعة تطلع مظبوطة */
export function LabelStyles() {
  return <style>{`
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@800;900&family=El+Messiri:wght@600;700&display=swap');
  .lbl{box-sizing:border-box;border:.2mm solid #ddd;break-inside:avoid;page-break-inside:avoid;font-family:'El Messiri',inherit;color:#0D0D0D;background:#fff;overflow:hidden;position:relative;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lbl.shelf{width:70mm;height:38mm;display:grid;grid-template-rows:9mm 1fr 11mm}
  .lbl.sticker{width:40mm;height:26mm;display:grid;grid-template-rows:1fr 9mm;padding:1mm}
  .lbl .bar{background:#0D0D0D;color:#F5C800;display:flex;align-items:center;justify-content:space-between;padding:0 2mm;font-size:2.6mm;font-weight:700}
  .lbl .lg{height:7.6mm;width:auto;display:block}
  .lbl .lgbox{background:#0D0D0D;border-radius:1mm;padding:.3mm .8mm;display:inline-flex}
  .lbl .lgbox .lg{height:5.6mm}
  .lbl .mid{display:flex;justify-content:space-between;align-items:center;padding:1mm 2.5mm;gap:2mm}
  .lbl .nm{font-weight:800;font-size:3.6mm;line-height:1.15;max-height:8.4mm;overflow:hidden}
  .lbl .sub{font-size:2.5mm;color:#666;margin-top:.6mm}
  .lbl .pr{font-family:Cairo,inherit;font-weight:900;font-size:9mm;line-height:1;white-space:nowrap;background:#F5C800;padding:1mm 2mm;border-radius:1.5mm}
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
  .ofr{box-sizing:border-box;width:96mm;height:32mm;position:relative;background:#FFD21F;overflow:hidden;direction:rtl;font-family:'El Messiri',inherit;color:#0D0D0D;break-inside:avoid;page-break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .ofr .lp{position:absolute;inset:0 auto 0 0;width:21mm;background:#000;clip-path:polygon(0 0,100% 0,82% 100%,0 100%);display:grid;place-items:center;padding-right:3mm}
  .ofr .lp img{width:15.5mm;height:auto;display:block}
  .ofr .rb{position:absolute;left:20mm;top:-1.5mm;width:13.5mm;height:19mm;background:var(--oc);clip-path:polygon(0 0,100% 0,100% 100%,50% 84%,0 100%);transform:rotate(-5deg);display:grid;align-content:center;justify-items:center;color:#fff;line-height:1}
  .ofr .rb i{position:absolute;inset:1mm 1mm 3.5mm;border:.25mm dashed rgba(255,255,255,.75);font-style:normal}
  .ofr .rb b{font-size:3.6mm;font-weight:700}.ofr .rb strong{font-family:Cairo,inherit;font-size:6.2mm;font-weight:900;direction:ltr}
  .ofr .nm2{position:absolute;left:35mm;right:33mm;top:2mm;text-align:center;font-weight:700;font-size:5.4mm;line-height:1.15;max-height:12.4mm;overflow:hidden}
  .ofr .sz{position:absolute;left:35mm;right:33mm;top:15mm;white-space:nowrap;overflow:hidden;display:flex;align-items:center;gap:1.5mm;font-weight:700;font-size:3mm;justify-content:center}
  .ofr .sz::before,.ofr .sz::after{content:"";flex:0 1 6mm;height:.35mm;background:#7a1010}
  .ofr .op{position:absolute;right:4mm;top:2.3mm;background:#0D0D0D;color:#fff;transform:skewX(-12deg);padding:.6mm 3mm;font-family:Cairo,inherit;font-weight:800;font-size:4.6mm;line-height:1.1;white-space:nowrap}
  .ofr .op::after{content:"";position:absolute;left:1.5mm;right:1.5mm;top:50%;height:.5mm;background:var(--oc);transform:rotate(-12deg)}
  .ofr .op small{font-size:2.6mm}
  .ofr .np{position:absolute;right:2.5mm;top:9.5mm;width:29mm;height:15.5mm;background:var(--oc);border:.7mm solid #fff;border-radius:3mm;transform:rotate(-4deg);display:flex;align-items:center;justify-content:center;gap:1.2mm;color:#fff;box-shadow:0 .6mm 0 rgba(0,0,0,.25)}
  .ofr .np b{font-family:Cairo,inherit;font-size:12.5mm;font-weight:900;line-height:1;direction:ltr;letter-spacing:-.3mm;text-shadow:0 .5mm 0 rgba(0,0,0,.28)}.ofr .np span{font-family:Cairo,inherit;font-size:3.8mm;font-weight:900;color:#FFD21F}
  .ofr .sp{position:absolute;right:30.5mm;top:7mm;width:3mm;height:3mm}
  .ofr .sp i{position:absolute;width:.6mm;height:2.6mm;background:var(--oc);border-radius:.3mm}
  .ofr .bt{position:absolute;left:0;right:0;bottom:0;height:6.2mm;background:#0D0D0D;display:flex;align-items:center;gap:2mm;padding-right:33mm;padding-left:22mm;color:#fff;font-weight:700;font-size:2.9mm;white-space:nowrap}
  .ofr .bt em{font-style:normal;color:#F5C800}.ofr .bt .sep{width:.25mm;height:3.5mm;background:#888}
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

/** ملصق العرض (تصميم المهرجان): لوجو باي رسلان، شريطة "وفّر %"، اسم الصنف، السعر القديم متشطّب والجديد كبير بلون المهرجان، وتحت اسم المهرجان ولحد إمتى */
export function OfferLabel({ d, offer }: { d: LabelData; offer: OfferInfo }) {
  const pct = d.old && d.price != null && d.old > d.price ? Math.round((1 - d.price / d.old) * 100) : 0;
  return (
    <div className="ofr" style={{ ["--oc" as string]: offer.color }}>
      <div className="lp"><img src="/logo-label.png" alt="By Raslan" /></div>
      <div className="bt"><span>{offer.name} 🔥</span>{offer.until && <><span className="sep" /><span><em>حتى</em> {offer.until}</span></>}</div>
      {pct > 0 && <div className="rb"><i /><b>وفّر</b><strong>{pct}%</strong></div>}
      <div className="nm2">{d.name}</div>
      {(d.size || d.maker) && <div className="sz">{[d.size ? `عبوة ${d.size}` : null, d.maker].filter(Boolean).join(" · ")}</div>}
      {d.old && d.old !== d.price ? <div className="op">{m(d.old)} <small>جنيه</small></div> : null}
      <div className="sp"><i style={{ right: 0, top: 0, transform: "rotate(35deg)" }} /><i style={{ right: "1.6mm", top: ".6mm", transform: "rotate(60deg)" }} /><i style={{ right: "-1.2mm", top: "1.8mm", transform: "rotate(10deg)" }} /></div>
      <div className="np"><b>{m(d.price)}</b><span>جنيه{kg(d.unit) ? " / كجم" : ""}</span></div>
    </div>
  );
}
