"use client";
import { QRCodeSVG } from "qrcode.react";

export default function Labels({ lots }: { lots: { code: string; name: string; qty: string; exp: string | null; sup: string }[] }) {
  if (!lots.length) return null;
  return (
    <>
      <div className="noprint row"><button className="btn pri" onClick={() => window.print()}>🖨️ اطبع ملصقات اللوت ({lots.length})</button></div>
      <div className="labels">
        {lots.map((l) => (
          <div key={l.code} className="label">
            <QRCodeSVG value={l.code} size={88} />
            <div>
              <b>{l.name}</b>
              <div className="num">{l.qty}</div>
              {l.exp && <div className="num">صلاحية {l.exp}</div>}
              <div style={{ fontSize: 10 }}>{l.sup}</div>
              <div className="num" dir="ltr" style={{ fontSize: 10 }}>{l.code}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
