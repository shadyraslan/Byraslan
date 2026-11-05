"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ScanInput from "@/components/ScanInput";
import { boxSn, crateId } from "@/lib/scan";
import { receiveTransfer } from "../actions";

type B = { sn: number; item: string; weight: number; unit: string; crate: string | null };

export default function Receive({ id, boxes }: { id: number; boxes: B[] }) {
  const router = useRouter();
  const [got, setGot] = useState<number[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [sure, setSure] = useState(false);
  const [pending, start] = useTransition();

  const onScan = (raw: string) => {
    const cr = crateId(raw);
    if (cr) {
      const inCrate = boxes.filter((b) => b.crate === cr).map((b) => b.sn);
      if (!inCrate.length) return setMsg({ ok: false, t: `الصندوق ${cr} مش في التحويل ده` });
      const add = inCrate.filter((s) => !got.includes(s));
      if (!add.length) return setMsg({ ok: false, t: `${cr} اتمسح قبل كده` });
      setGot((g) => [...g, ...add]);
      setSure(false);
      return setMsg({ ok: true, t: `✓ ${cr} — ${add.length} علبة اتستلمت` });
    }
    const sn = boxSn(raw);
    if (!sn) return setMsg({ ok: false, t: `"${raw}" مش ملصق علبة` });
    if (!boxes.some((b) => b.sn === sn)) return setMsg({ ok: false, t: `العلبة #${sn} مش من التحويل ده — رجّعها` });
    if (got.includes(sn)) return setMsg({ ok: false, t: `#${sn} اتمسحت قبل كده` });
    setGot((g) => [...g, sn]);
    setSure(false);
    const b = boxes.find((x) => x.sn === sn)!;
    setMsg({ ok: true, t: `✓ #${sn} ${b.item}` });
  };

  const miss = boxes.filter((b) => !got.includes(b.sn));
  const done = () =>
    start(async () => {
      if (miss.length && !sure) {
        setSure(true);
        return setMsg({ ok: false, t: `ناقص ${miss.length} علبة — دوس "استلم" تاني لو متأكد، وهتتسجّل ناقصة` });
      }
      const r = await receiveTransfer(id, got);
      if (!r.ok) return setMsg({ ok: false, t: r.error });
      router.refresh();
    });

  return (
    <div className="card" style={{ border: "2px solid var(--y)" }}>
      <h2>امسح كل علبة وانت بتستلمها <span className="pill num">{got.length}/{boxes.length}</span></h2>
      <ScanInput onScan={onScan} placeholder="امسح الصندوق (كل اللي جواه) أو العلبة" />
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      <div className="row" style={{ gap: 6 }}>
        {boxes.map((b) => <span key={b.sn} className="pill" style={got.includes(b.sn) ? { background: "color-mix(in srgb,var(--good) 18%,transparent)", color: "var(--good)" } : {}}>{got.includes(b.sn) ? "✓ " : ""}#{b.sn} {b.item}</span>)}
      </div>
      <button className="btn pri" onClick={done} disabled={pending} style={{ height: 48 }}>{pending ? "…" : "استلم"}</button>
    </div>
  );
}
