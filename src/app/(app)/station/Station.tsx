"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stepStart, stepFinish } from "../production/actions";

export type Job = { order: number; no: number; step: number; item: string; unit: string; qty: number; status: string; in_weight: number | null; prev_out: number | null; last: boolean };

export default function Station({ jobs }: { jobs: Job[] }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, { a: string; b: string }>>({});
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const v = (k: string) => vals[k] ?? { a: "", b: "" };
  const set = (k: string, p: Partial<{ a: string; b: string }>) => setVals((s) => ({ ...s, [k]: { ...v(k), ...p } }));

  const go = (j: Job) =>
    start(async () => {
      const k = `${j.order}-${j.step}`;
      const r = j.status === "waiting"
        ? await stepStart(j.order, j.step, Number(v(k).a || j.prev_out || 0))
        : await stepFinish(j.order, j.step, Number(v(k).a), Number(v(k).b || 0));
      if (!r.ok) { setMsg({ ok: false, t: r.error }); return; }
      setMsg({ ok: true, t: j.status === "waiting" ? `بدأ أمر #${j.no}` : r.msg === "الأمر خلص" ? `أمر #${j.no} خلص ✓` : `خلص — يروح على ${r.msg}` });
      router.refresh();
    });

  return (
    <>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"} style={{ fontSize: 17 }}>{msg.t}</div>}
      <div className="jobs">
        {jobs.map((j) => {
          const k = `${j.order}-${j.step}`;
          return (
            <div key={k} className="card job" style={j.status === "running" ? { borderColor: "var(--y)", borderWidth: 2 } : {}}>
              <div className="row" style={{ justifyContent: "space-between" }}><b style={{ fontSize: 18 }}>{j.item}</b><span className="pill num">#{j.no}</span></div>
              <div className="muted">المطلوب {j.qty} {j.unit}{j.prev_out ? ` · جاي من الغرفة اللي قبلها ${j.prev_out} كجم` : ""}{j.in_weight ? ` · دخل ${j.in_weight} كجم` : ""}</div>
              {j.status === "waiting" ? (
                <>
                  <label className="fld">الوزن اللي داخل (كجم)<input value={v(k).a} onChange={(e) => set(k, { a: e.target.value })} placeholder={j.prev_out ? String(j.prev_out) : ""} inputMode="decimal" dir="ltr" style={{ height: 52, fontSize: 20 }} /></label>
                  <button className="btn pri" onClick={() => go(j)} disabled={pending} style={{ height: 60, fontSize: 20 }}>▶ ابدأ</button>
                </>
              ) : (
                <>
                  <div className="grid2">
                    <label className="fld">الوزن الطالع (كجم)<input value={v(k).a} onChange={(e) => set(k, { a: e.target.value })} inputMode="decimal" dir="ltr" style={{ height: 52, fontSize: 20 }} /></label>
                    <label className="fld">الهالك (كجم)<input value={v(k).b} onChange={(e) => set(k, { b: e.target.value })} inputMode="decimal" dir="ltr" style={{ height: 52, fontSize: 20 }} /></label>
                  </div>
                  <button className="btn pri" onClick={() => go(j)} disabled={pending} style={{ height: 60, fontSize: 20 }}>✓ خلّصت{j.last ? " — يروح للتغليف" : ""}</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {!jobs.length && <div className="card muted" style={{ fontSize: 18, textAlign: "center", padding: 40 }}>مفيش شغل للغرفة دي دلوقتي</div>}
    </>
  );
}
