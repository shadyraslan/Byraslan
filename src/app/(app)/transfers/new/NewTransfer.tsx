"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScanInput from "@/components/ScanInput";
import { boxSn } from "@/lib/scan";
import { checkBox, sendTransfer, type BoxInfo } from "../actions";

type Loc = { id: string; name: string };
const WHY = ["فرع ناقصه حاجة مستعجلة", "نقل زيادة من فرع لفرع", "مرتجع للمصنع", "طلبية خاصة / عميل جملة", "سبب تاني"];

export default function NewTransfer({ locs }: { locs: Loc[] }) {
  const router = useRouter();
  const [from, setFrom] = useState(locs.find((l) => l.id === "factory")?.id ?? locs[0]?.id ?? "");
  const [to, setTo] = useState(locs.find((l) => l.id !== from)?.id ?? "");
  const [why, setWhy] = useState(WHY[0]);
  const [note, setNote] = useState("");
  const [boxes, setBoxes] = useState<BoxInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();

  const bad = (t: string) => { setMsg({ ok: false, t }); try { navigator.vibrate?.(200); } catch {} };

  const onScan = (raw: string) => {
    const sn = boxSn(raw);
    if (!sn) return bad(`"${raw}" مش ملصق علبة`);
    if (boxes.some((b) => b.sn === sn)) return bad(`#${sn} اتمسحت قبل كده`);
    start(async () => {
      const r = await checkBox(sn, from);
      if (!r.ok) return bad(r.error);
      setBoxes((L) => [r.box, ...L]);
      setMsg({ ok: true, t: `✓ #${r.box.sn} ${r.box.item} · ${r.box.weight} ${r.box.unit}` });
    });
  };

  const groups = boxes.reduce<Record<string, { n: number; w: number; unit: string }>>((m, b) => {
    const g = (m[b.item] ??= { n: 0, w: 0, unit: b.unit });
    g.n++; g.w += b.weight;
    return m;
  }, {});

  const send = () =>
    start(async () => {
      if (from === to) return bad("من وإلى لازم يكونوا مختلفين");
      if (!boxes.length) return bad("امسح العلب الأول");
      const r = await sendTransfer(from, to, boxes.map((b) => b.sn), why, note);
      if (!r.ok) return bad(r.error);
      router.push(`/transfers/${r.id}`);
    });

  return (
    <>
      <div className="card">
        <div className="grid2">
          <label className="fld">من<select value={from} onChange={(e) => { setFrom(e.target.value); if (boxes.length) { setBoxes([]); setMsg({ ok: false, t: "غيّرت المكان — امسح تاني" }); } }}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="fld">إلى<select value={to} onChange={(e) => setTo(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        </div>
      </div>
      <div className="card" style={{ border: "2px solid var(--y)" }}>
        <h2>امسح كل علبة وهي طالعة</h2>
        <ScanInput onScan={onScan} placeholder="امسح QR العلبة" />
        {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
        {Object.entries(groups).map(([n, g]) => (
          <div key={n} className="row" style={{ justifyContent: "space-between" }}><b>{n}</b><span className="num">{g.n} علبة · {g.w.toFixed(2)} {g.unit}</span></div>
        ))}
        <div className="row" style={{ gap: 6 }}>
          {boxes.map((b) => (
            <span key={b.sn} className="pill">#{b.sn} <button type="button" onClick={() => setBoxes((L) => L.filter((x) => x.sn !== b.sn))} style={{ border: 0, background: "none", color: "var(--bad)", cursor: "pointer" }}>×</button></span>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="grid2">
          <label className="fld">السبب<select value={why} onChange={(e) => setWhy(e.target.value)}>{WHY.map((w) => <option key={w}>{w}</option>)}</select></label>
          <label className="fld">ملاحظة (العربية، السواق)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <button className="btn pri" onClick={send} disabled={pending || !boxes.length} style={{ height: 48 }}>{pending ? "…" : `ابعت التحويل (${boxes.length} علبة)`}</button>
        <div className="note">مفيش كمية بتتكتب باليد: كل علبة بتتمسح، والسيستم بيرفض أي علبة مش في المكان ده أو متباعة أو في تحويل تاني. الاستلام في الناحية التانية بالمسح برضه.</div>
      </div>
    </>
  );
}
