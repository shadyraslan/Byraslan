"use client";
import { QRCodeSVG } from "qrcode.react";

export default function CrateLabels({ ids }: { ids: string[] }) {
  return (
    <>
      <div className="card noprint row" style={{ justifyContent: "space-between" }}>
        <span>{ids.length} صندوق — كل ملصق بيتلزق على صندوق، والعامل بيمسحه قبل العلب اللي جواه.</span>
        <button className="btn pri" onClick={() => window.print()}>اطبع كلهم</button>
      </div>
      <div className="crates">
        {ids.map((id) => (
          <div key={id} className="crate">
            <QRCodeSVG value={id} size={120} level="M" />
            <div><div className="crid">{id}</div><div>صندوق تحميل باي رسلان</div><div className="muted">امسحه قبل العلب</div></div>
          </div>
        ))}
      </div>
    </>
  );
}
