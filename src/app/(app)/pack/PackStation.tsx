"use client";
import { useState, useTransition } from "react";
import { QRCodeSVG } from "qrcode.react";
import ScanInput from "@/components/ScanInput";
import { useRouter } from "next/navigation";
import { packBox, packFinish, type Packed } from "./actions";

export type Ready = { id: number; no: number; item_name: string; qty: number; boxes: number };

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");

export default function PackStation({ ready }: { ready: Ready[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<number | null>(null);
  const [boxes, setBoxes] = useState<Packed[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [auto, setAuto] = useState(true);
  const [label, setLabel] = useState<Packed | null>(null);
  const [pending, start] = useTransition();

  const print = (b: Packed) => {
    setLabel(b);
    setTimeout(() => window.print(), 60);
  };

  const onScan = (code: string) =>
    start(async () => {
      const r = await packBox(code, order);
      if (!r.ok) {
        setMsg({ ok: false, t: r.error });
        try { navigator.vibrate?.(200); } catch {}
        return;
      }
      setBoxes((L) => [r.box, ...L].slice(0, 50));
      setMsg({ ok: true, t: `علبة #${r.box.sn} — ${r.box.item_name} — ${r.box.weight} ${r.box.unit}` });
      if (auto) print(r.box);
    });

  return (
    <>
      <div className="card noprint" style={{ border: "2px solid var(--y)" }}>
        <h2>امسح ملصق الميزان</h2>
        <div className="row">
          <label className="fld" style={{ flex: "1 1 260px" }}>بتغلّف لأنهي أمر إنتاج؟
            <select value={order ?? ""} onChange={(e) => setOrder(e.target.value ? Number(e.target.value) : null)} style={{ height: 46 }}>
              <option value="">— من غير أمر —</option>
              {ready.map((o) => <option key={o.id} value={o.id}>#{o.no} · {o.item_name} · {o.qty} ({o.boxes} علبة لحد دلوقتي)</option>)}
            </select>
          </label>
          {order && <button className="btn" disabled={pending} style={{ height: 46 }} onClick={() => start(async () => {
            if (!confirm("خلّصت تغليف الأمر ده؟ الوزن الطالع هيبقى مجموع العلب")) return;
            const r = await packFinish(order);
            setMsg(r.ok ? { ok: true, t: `الأمر اتقفل — ${r.msg}` } : { ok: false, t: r.error });
            if (r.ok) { setOrder(null); router.refresh(); }
          })}>✓ خلّص تغليف الأمر</button>}
        </div>
        <ScanInput onScan={onScan} placeholder="امسح ملصق الميزان — بيتسجّل لوحده" />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ height: 18, width: 18 }} />
            اطبع الاستيكر لوحده بعد كل علبة
          </label>
          <span className="muted" style={{ fontSize: 12.5 }}>{pending ? "بيسجّل…" : `${boxes.length} علبة في الوردية دي`}</span>
        </div>
        {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      </div>

      <div className="card noprint">
        <h2>آخر العلب</h2>
        <table>
          <thead><tr><th>رقم العلبة</th><th>الصنف</th><th>الوزن</th><th>الصلاحية</th><th></th></tr></thead>
          <tbody>
            {boxes.map((b) => (
              <tr key={b.sn}>
                <td className="num"><b>#{b.sn}</b></td>
                <td>{b.item_name}</td>
                <td className="num">{b.weight} {b.unit}</td>
                <td className="num">{fmtDate(b.expires_at)}</td>
                <td><button className="btn" onClick={() => print(b)} style={{ height: 32 }}>اطبع تاني</button></td>
              </tr>
            ))}
            {!boxes.length && <tr><td colSpan={5} className="muted">لسه مفيش علب — امسح أول ملصق</td></tr>}
          </tbody>
        </table>
      </div>

      {label && (
        <div className="label onlyprint">
          <QRCodeSVG value={`R${label.sn}`} size={110} level="M" />
          <div className="lbtxt">
            <div className="lbsn">#{label.sn}</div>
            <div className="lbname">{label.item_name}</div>
            <div>{label.weight} {label.unit}</div>
            <div>إنتاج {new Date().toLocaleDateString("en-GB")}</div>
            <div>صلاحية {fmtDate(label.expires_at)}</div>
            <div className="lbbrand">By Raslan · Rosto&apos;s</div>
          </div>
        </div>
      )}
    </>
  );
}
