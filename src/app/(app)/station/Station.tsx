"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { stepStart, stepFinish } from "../production/actions";
import { supabaseBrowser } from "@/lib/supabase/client";

export type Job = { order: number; no: number; step: number; item: string; unit: string; qty: number; status: string; in_weight: number | null; yield_pct?: number; prev_out: number | null; last: boolean; started?: string | null; first?: boolean; lots?: { code: string; qty: number | null; item: string; supplier: string }[] };

function Timer({ from }: { from: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const sec = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d0d", color: "#f5c800", borderRadius: 12, padding: "8px 14px" }}><span style={{ color: "#fff", fontWeight: 700 }}>⏱ شغال من</span><b className="num" dir="ltr" style={{ fontSize: 28 }}>{h ? `${h}:` : ""}{p(m)}:{p(x)}</b></div>;
}

// أول غرفة: اللوطات الداخلة في الأمر (عشان التتبّع من المورد للعميل)
function Lots({ j, onDone }: { j: Job; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [qty, setQty] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sb = supabaseBrowser();
  const add = async () => {
    if (!code.trim()) return;
    const { error } = await sb.rpc("prod_lot_add", { p_order: j.order, p_code: code.trim(), p_qty: qty ? Number(qty) : null });
    if (error) return setErr(error.message.replace(/^.*?ERROR:\s*/, ""));
    setErr(null); setCode(""); setQty(""); onDone();
  };
  return (
    <div style={{ display: "grid", gap: 6, background: "rgba(245,200,0,.08)", borderRadius: 12, padding: 10 }}>
      <b>📦 اللوطات الداخلة {j.lots?.length ? `(${j.lots.length})` : "— امسح ملصق الاستلام"}</b>
      {(j.lots ?? []).map((l) => (
        <div key={l.code} className="row" style={{ justifyContent: "space-between" }}>
          <span><b dir="ltr">{l.code}</b> · {l.item}{l.supplier ? ` · ${l.supplier}` : ""}{l.qty ? ` · ${l.qty}` : ""}</span>
          <button className="btn" style={{ height: 30 }} onClick={async () => { await sb.rpc("prod_lot_remove", { p_order: j.order, p_lot: l.code }); onDone(); }}>شيل</button>
        </div>
      ))}
      <div className="row">
        <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="امسح أو اكتب رقم اللوط" dir="ltr" style={{ flex: 1, height: 46, fontSize: 17 }} />
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="الكمية (اختياري)" inputMode="decimal" dir="ltr" style={{ width: 130, height: 46 }} />
        <button className="btn pri" style={{ height: 46 }} onClick={add}>ضيف</button>
      </div>
      {err && <div className="badmsg">{err}</div>}
    </div>
  );
}

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
              <div className="muted">المطلوب {j.qty} {j.unit}{j.prev_out ? ` · جاي من الغرفة اللي قبلها ${j.prev_out} كجم` : ""}{j.in_weight ? ` · دخل ${j.in_weight} كجم` : ""}{j.in_weight && j.yield_pct && j.yield_pct !== 100 ? ` · المتوقع يطلع ≈ ${Math.round(j.in_weight * j.yield_pct) / 100} كجم (${j.yield_pct}%)` : ""}</div>
              {j.first && <Lots j={j} onDone={() => router.refresh()} />}
              {j.status === "waiting" ? (
                <>
                  <label className="fld">الوزن اللي داخل (كجم)<input value={v(k).a} onChange={(e) => set(k, { a: e.target.value })} placeholder={j.prev_out ? String(j.prev_out) : ""} inputMode="decimal" dir="ltr" style={{ height: 52, fontSize: 20 }} /></label>
                  <button className="btn pri" onClick={() => go(j)} disabled={pending} style={{ height: 60, fontSize: 20 }}>▶ ابدأ</button>
                </>
              ) : (
                <>
                  {j.started && <Timer from={j.started} />}
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
