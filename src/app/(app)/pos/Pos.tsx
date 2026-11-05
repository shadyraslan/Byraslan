"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScanInput from "@/components/ScanInput";
import { posLookup, posSale, closeShift, type PosLine, type Receipt } from "./actions";

const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Pos({ shift, loc, locName, cashier, canDiscount }: { shift: number; loc: string; locName: string; cashier: string; canDiscount: boolean }) {
  const router = useRouter();
  const [lines, setLines] = useState<PosLine[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [disc, setDisc] = useState("");
  const [cash, setCash] = useState("");
  const [card, setCard] = useState("");
  const [rec, setRec] = useState<(Receipt & { lines: PosLine[]; disc: number; cash: number; card: number; at: string }) | null>(null);
  const [pending, start] = useTransition();

  const sub = lines.reduce((a, l) => a + Math.round(l.qty * l.unit_price * 100) / 100, 0);
  const d = Math.min(Number(disc) || 0, sub);
  const total = Math.max(sub - d, 0);
  const paid = (Number(cash) || 0) + (Number(card) || 0);
  const bad = (t: string) => { setMsg({ ok: false, t }); try { navigator.vibrate?.(200); } catch {} };

  const onScan = (code: string) =>
    start(async () => {
      const r = await posLookup(loc, code);
      if (!r.ok) return bad(r.error);
      const l = r.line;
      if (l.box_sn && lines.some((x) => x.box_sn === l.box_sn)) return bad(`العلبة #${l.box_sn} في الفاتورة قبل كده`);
      setLines((L) => {
        if (!l.box_sn) {
          const i = L.findIndex((x) => !x.box_sn && x.item_id === l.item_id);
          if (i >= 0) return L.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
        }
        return [...L, l];
      });
      setMsg({ ok: true, t: `✓ ${l.item_name}${l.box_sn ? ` #${l.box_sn}` : ""} — ${l.qty} ${l.unit} × ${f2(l.unit_price)}` });
    });

  const pay = () =>
    start(async () => {
      if (!lines.length) return bad("الفاتورة فاضية");
      const c = Number(cash) || (card ? 0 : total);
      const k = Number(card) || 0;
      const r = await posSale(shift, lines, d, c, k);
      if (!r.ok) return bad(r.error);
      setRec({ ...r.r, lines, disc: d, cash: c, card: k, at: new Date().toLocaleString("en-GB") });
      setLines([]); setDisc(""); setCash(""); setCard(""); setMsg(null);
      setTimeout(() => window.print(), 80);
    });

  const endShift = () =>
    start(async () => {
      const v = prompt("الكاش اللي في الدرج كام؟");
      if (v == null) return;
      const r = await closeShift(shift, Number(v) || 0);
      if (!r.ok) return bad(r.error);
      alert(r.diff === 0 ? "الوردية اتقفلت — الدرج مظبوط" : `الوردية اتقفلت — ${r.diff > 0 ? "زيادة" : "عجز"} ${f2(Math.abs(r.diff))} ج`);
      router.refresh();
    });

  return (
    <>
      <div className="pos noprint">
        <div className="card" style={{ border: "2px solid var(--y)" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>{locName} · {cashier}</b><button className="btn" onClick={endShift} disabled={pending} style={{ height: 34 }}>اقفل الوردية</button></div>
          <ScanInput onScan={onScan} placeholder="امسح QR العلبة أو باركود الصنف" />
          {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
          <table>
            <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th></th></tr></thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i}>
                  <td><b>{l.item_name}</b>{l.box_sn && <span className="muted num"> #{l.box_sn}</span>}</td>
                  <td className="num">{l.box_sn ? `${l.qty} ${l.unit}` : (
                    <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                      <button className="btn" style={{ height: 28, width: 28, padding: 0 }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>−</button>
                      {l.qty}
                      <button className="btn" style={{ height: 28, width: 28, padding: 0 }} onClick={() => setLines((L) => L.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}>+</button>
                    </span>)}</td>
                  <td className="num">{f2(l.unit_price)}</td>
                  <td className="num"><b>{f2(Math.round(l.qty * l.unit_price * 100) / 100)}</b></td>
                  <td><button className="btn" style={{ height: 28 }} onClick={() => setLines((L) => L.filter((_, j) => j !== i))}>×</button></td>
                </tr>
              ))}
              {!lines.length && <tr><td colSpan={5} className="muted">امسح أول صنف</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card paybox">
          <div className="row" style={{ justifyContent: "space-between" }}><span>المجموع</span><b className="num">{f2(sub)}</b></div>
          {canDiscount && <label className="fld">خصم على الفاتورة (ج)<input value={disc} onChange={(e) => setDisc(e.target.value)} inputMode="decimal" dir="ltr" /></label>}
          <div className="row" style={{ justifyContent: "space-between", fontSize: 22 }}><span>الإجمالي</span><b className="num">{f2(total)}</b></div>
          <label className="fld">كاش<input value={cash} onChange={(e) => setCash(e.target.value)} inputMode="decimal" dir="ltr" placeholder={f2(total)} /></label>
          <div className="row" style={{ gap: 6 }}>{[total, 50, 100, 200, 500].filter((v, i) => i === 0 || v > total).slice(0, 4).map((v, i) => <button key={i} className="btn" onClick={() => setCash(String(Math.ceil(v)))} style={{ height: 34 }}>{i === 0 ? "مظبوط" : v}</button>)}</div>
          <label className="fld">فيزا<input value={card} onChange={(e) => setCard(e.target.value)} inputMode="decimal" dir="ltr" /></label>
          {paid > total && <div className="okmsg">الباقي للعميل: {f2(paid - total)} ج</div>}
          <button className="btn pri" onClick={pay} disabled={pending || !lines.length} style={{ height: 56, fontSize: 18 }}>{pending ? "…" : `ادفع ${f2(total)} ج`}</button>
        </div>
      </div>

      {rec && (
        <div className="receipt onlyprint">
          <div style={{ textAlign: "center" }}><img src="/logo.png" alt="" style={{ width: 120, filter: "invert(1)" }} /><div>{locName}</div><div>فاتورة #{rec.sale_no} · {rec.at}</div></div>
          <table>
            <tbody>{rec.lines.map((l, i) => <tr key={i}><td>{l.item_name}{l.box_sn ? ` #${l.box_sn}` : ""}<br />{l.qty} × {f2(l.unit_price)}</td><td style={{ textAlign: "left" }}>{f2(Math.round(l.qty * l.unit_price * 100) / 100)}</td></tr>)}</tbody>
          </table>
          {rec.disc > 0 && <div className="rrow"><span>خصم</span><span>-{f2(rec.disc)}</span></div>}
          <div className="rrow" style={{ fontWeight: 800, fontSize: "12pt" }}><span>الإجمالي</span><span>{f2(rec.total)}</span></div>
          {rec.cash > 0 && <div className="rrow"><span>كاش</span><span>{f2(rec.cash)}</span></div>}
          {rec.card > 0 && <div className="rrow"><span>فيزا</span><span>{f2(rec.card)}</span></div>}
          {rec.change > 0 && <div className="rrow"><span>الباقي</span><span>{f2(rec.change)}</span></div>}
          <div style={{ textAlign: "center", marginTop: 6 }}>شكرًا لزيارتك — {cashier}</div>
        </div>
      )}
    </>
  );
}
