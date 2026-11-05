"use client";
import { useState, useTransition } from "react";
import ScanInput from "@/components/ScanInput";
import { boxSn } from "@/lib/scan";
import { checkBox, type BoxInfo } from "../../transfers/actions";
import { disposeBoxes } from "../../boxes/actions";

type Loc = { id: string; name: string };
const WASTE = ["انتهت الصلاحية", "اتلف في التخزين", "مرتجع عميل تالف", "عطل تلاجة", "سبب تاني"];
const DON = ["قربت تخلص وسليمة", "مرتجع عميل سليم", "طلب اترفض على الباب", "زيادة عن البيع", "سبب تاني"];

export default function Dispose({ locs, canWaste, canDonate }: { locs: Loc[]; canWaste: boolean; canDonate: boolean }) {
  const [loc, setLoc] = useState(locs[0]?.id ?? "");
  const [kind, setKind] = useState<"waste" | "donate">(canWaste ? "waste" : "donate");
  const [why, setWhy] = useState((canWaste ? WASTE : DON)[0]);
  const [boxes, setBoxes] = useState<BoxInfo[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const W = kind === "waste" ? WASTE : DON;

  const onScan = (raw: string) => {
    const sn = boxSn(raw);
    if (!sn) return setMsg({ ok: false, t: `"${raw}" مش ملصق علبة` });
    if (boxes.some((b) => b.sn === sn)) return setMsg({ ok: false, t: `#${sn} اتمسحت قبل كده` });
    start(async () => {
      const r = await checkBox(sn, loc);
      if (!r.ok && !(kind === "waste" && r.error.includes("صلاحيتها خلصت"))) { setMsg({ ok: false, t: r.error }); return; }
      const box = r.ok ? r.box : { sn, item: "علبة صلاحيتها خلصت", weight: 0, unit: "" };
      setBoxes((L) => [box, ...L]);
      setMsg({ ok: true, t: `✓ #${sn} ${box.item}` });
    });
  };

  const go = () =>
    start(async () => {
      const r = await disposeBoxes(loc, kind, boxes.map((b) => b.sn), why);
      if (!r.ok) { setMsg({ ok: false, t: r.error }); return; }
      setBoxes([]);
      setMsg({ ok: true, t: `${r.n} علبة ${kind === "waste" ? "اتسجّلت هالك" : "اتحوّلت لمخزن التبرعات"}` });
    });

  return (
    <>
      <div className="card">
        <div className="grid2">
          <label className="fld">من<select value={loc} onChange={(e) => { setLoc(e.target.value); setBoxes([]); }}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="fld">رايحة فين<select value={kind} onChange={(e) => { const k = e.target.value as "waste" | "donate"; setKind(k); setWhy((k === "waste" ? WASTE : DON)[0]); }}>
            {canWaste && <option value="waste">🗑 هالك (إعدام)</option>}
            {canDonate && <option value="donate">🤲 مخزن التبرعات</option>}
          </select></label>
          <label className="fld">السبب<select value={why} onChange={(e) => setWhy(e.target.value)}>{W.map((w) => <option key={w}>{w}</option>)}</select></label>
        </div>
      </div>
      <div className="card" style={{ border: "2px solid var(--y)" }}>
        <h2>امسح العلب <span className="pill num">{boxes.length}</span></h2>
        <ScanInput onScan={onScan} placeholder="امسح QR العلبة" />
        {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
        <div className="row" style={{ gap: 6 }}>{boxes.map((b) => <span key={b.sn} className="pill">#{b.sn} {b.item}</span>)}</div>
        <button className="btn pri" onClick={go} disabled={pending || !boxes.length} style={{ height: 48 }}>{kind === "waste" ? `سجّل ${boxes.length} علبة هالك` : `حوّل ${boxes.length} علبة للتبرعات`}</button>
      </div>
    </>
  );
}
