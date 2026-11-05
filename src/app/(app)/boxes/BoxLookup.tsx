"use client";
import { useEffect, useState, useTransition } from "react";
import ScanInput from "@/components/ScanInput";
import { boxSn } from "@/lib/scan";
import { getBox, resolveMissing, type BoxCard } from "./actions";

const ST: Record<string, string> = { stock: "في المخزون", transit: "في تحويل في الطريق", loaded: "على عربية", sold: "اتباعت", waste: "هالك", donated: "اتبرعنا بيها", missing: "ناقصة — بيتحقق فيها" };
const KIND: Record<string, string> = { pack: "اتغلّفت", transfer: "تحويل", sale: "بيع", waste: "هالك", donate: "تبرعات", adjust: "تعديل", count: "جرد", return: "مرتجع", receive: "استلام", production: "إنتاج" };
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : "—");

export default function BoxLookup({ canFix, initial }: { canFix: boolean; initial?: number }) {
  const [box, setBox] = useState<BoxCard | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const load = (sn: number) =>
    start(async () => {
      const r = await getBox(sn);
      if (!r.ok) { setBox(null); setMsg({ ok: false, t: r.error }); return; }
      setBox(r.box);
      setMsg(null);
    });

  useEffect(() => {
    if (initial) load(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const onScan = (raw: string) => {
    const sn = boxSn(raw);
    if (!sn) return setMsg({ ok: false, t: `"${raw}" مش ملصق علبة` });
    load(sn);
  };

  const fix = (found: boolean) =>
    start(async () => {
      if (!box) return;
      if (!found && note.trim().length < 3) { setMsg({ ok: false, t: "اكتب إيه اللي حصل قبل ما تسجّلها ضاعت" }); return; }
      const r = await resolveMissing(box.sn, found, note);
      if (!r.ok) { setMsg({ ok: false, t: r.error }); return; }
      setMsg({ ok: true, t: r.msg });
      const again = await getBox(box.sn);
      if (again.ok) setBox(again.box);
    });

  return (
    <>
      <div className="card" style={{ border: "2px solid var(--y)" }}>
        <h2>امسح أي علبة</h2>
        <ScanInput onScan={onScan} placeholder="امسح QR العلبة أو اكتب رقمها" />
        {pending && <div className="muted">بيدوّر…</div>}
        {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      </div>
      {box && (
        <div className="card">
          <h2>علبة #{box.sn} — {box.item}</h2>
          <div className="row" style={{ gap: 14 }}>
            <span>الوزن: <b className="num">{box.weight} {box.unit}</b></span>
            <span>هي فين: <b>{box.location}</b></span>
            <span>الحالة: <b style={box.status === "missing" ? { color: "var(--bad)" } : {}}>{ST[box.status] ?? box.status}</b></span>
            <span>اتغلّفت: <span className="num">{dt(box.packed_at)}</span></span>
            <span>الصلاحية: <span className="num">{dt(box.expires_at)}</span></span>
          </div>
          {box.status === "missing" && canFix && (
            <div className="row" style={{ background: "var(--sunk)", borderRadius: 12, padding: 10 }}>
              <label className="fld" style={{ flex: "1 1 220px" }}>ملاحظة<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلًا: لقيناها في العربية" /></label>
              <button className="btn pri" onClick={() => fix(true)} disabled={pending}>✓ لقيناها</button>
              <button className="btn" onClick={() => fix(false)} disabled={pending}>✗ ضاعت ← هالك</button>
            </div>
          )}
          <table>
            <thead><tr><th>الوقت</th><th>إيه اللي حصل</th><th>فين</th><th>الكمية</th><th>مين</th></tr></thead>
            <tbody>
              {box.history.map((h, i) => (
                <tr key={i}><td className="num" style={{ fontSize: 12 }}>{dt(h.at)}</td><td>{KIND[h.kind] ?? h.kind}{h.reason ? <div className="muted" style={{ fontSize: 12 }}>{h.reason}</div> : null}</td><td>{h.location_name}</td><td className="num" style={{ color: Number(h.qty) < 0 ? "var(--bad)" : "var(--good)" }}>{Number(h.qty) > 0 ? "+" : ""}{h.qty}</td><td>{h.by_name ?? "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
