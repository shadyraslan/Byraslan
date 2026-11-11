"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import ScanInput from "@/components/ScanInput";

type Line = { line: number; item_id: number; name: string; unit: string; qty: number; prepared: number | null; barcodes: string[] | null; sub_status: string | null; sub_name: string | null; sub_price: number | null; sub_deadline: string | null; sub_of: number | null; price: number };
type Sug = { item_id: number; name: string; unit: string; price: number };
type O = { id: number; no: number; status: string; at: string; customer: string | null; near: boolean; prep: { receipt_no: string | null; amount: number | null; bags: number | null; status: string; code: string | null } | null; lines: Line[]; sub_pref?: string };
function beep() { try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 880; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.3); setTimeout(() => c.close(), 600); } catch {} }

/** ديسباتشر الماركت: طلبات فيها أصناف شريك ← امسح أو "اتجاب" / "مش موجود" ← رقم إيصال الكاشير والمبلغ والشنط ← جاهز للكابتن */
export default function Dispatch({ locs, home }: { locs: { id: string; name: string }[]; home: string | null }) {
  const sb = supabaseBrowser();
  const [loc, setLoc] = useState(locs.find((l) => l.id === home)?.id ?? locs[0]?.id ?? "");
  const [L, setL] = useState<O[]>([]);
  const [cur, setCur] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [f, setF] = useState({ receipt: "", amount: "", bags: "1" });
  const [sug, setSug] = useState<{ line: number; list: Sug[] } | null>(null);
  const [code, setCode] = useState<Record<number, string>>({});
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(i); }, []);
  const err = (e: { message: string }) => setMsg({ ok: false, t: e.message.replace(/^.*?ERROR:\s*/, "") });
  const suggest = async (order: number, line: number) => {
    const { data, error } = await sb.rpc("partner_sub_suggest", { p_order: order, p_line: line });
    if (error) return err(error);
    setSug({ line, list: (data ?? []) as Sug[] });
  };
  const offer = async (order: number, line: number, item: number) => {
    const { data, error } = await sb.rpc("partner_offer_sub", { p_order: order, p_line: line, p_item: item, p_qty: null });
    if (error) return err(error);
    setMsg({ ok: true, t: String(data) }); setSug(null); load();
  };
  const handover = async (order: number) => {
    const { data, error } = await sb.rpc("partner_handover", { p_order: order, p_code: code[order] ?? "" });
    if (error) return err(error);
    if (data) return setMsg({ ok: false, t: String(data) });
    setMsg({ ok: true, t: "اتسلّم للكابتن ✅" }); load();
  };
  const bagLabels = (x: O) => {
    const n = Math.max(1, Number(x.prep?.bags) || 1), w = window.open("", "_blank", "width=420,height=600");
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><title>شنط طلب ${x.no}</title><style>@page{size:60mm 40mm;margin:0}body{margin:0;font-family:sans-serif}.b{width:60mm;height:40mm;box-sizing:border-box;padding:3mm;display:grid;align-content:center;justify-items:center;gap:1mm;break-after:page;border:1px dashed #ccc}.n{font-size:9mm;font-weight:900}.c{font-size:6mm;letter-spacing:2mm;border:.6mm solid #000;padding:0 2mm;font-weight:800}</style></head><body>${
      Array.from({ length: n }, (_, i) => `<div class="b"><div>باي رسلان — ماركت</div><div class="n">#${x.no}</div><div>شنطة ${i + 1} من ${n}</div><div class="c">${x.prep?.code ?? ""}</div><div style="font-size:3mm">التسليم بكود الكابتن بس</div></div>`).join("")}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  const seen = useRef(new Set<number>());
  const load = useCallback(async () => {
    if (!loc) return;
    const { data, error } = await sb.rpc("partner_queue", { p_loc: loc });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    const n = (data ?? []) as O[];
    if (seen.current.size && n.some((o) => !seen.current.has(o.id))) beep();
    n.forEach((o) => seen.current.add(o.id));
    setL(n);
  }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seen.current = new Set(); load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);
  const o = L.find((x) => x.id === cur) ?? null;
  const pick = async (order: number, line: number, qty: number) => {
    const { error } = await sb.rpc("partner_pick", { p_order: order, p_line: line, p_qty: qty });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    load();
  };
  const onScan = (raw: string) => {
    if (!o) return setMsg({ ok: false, t: "افتح طلب الأول" });
    const l = o.lines.find((x) => (x.barcodes ?? []).includes(raw.trim()) && x.prepared == null);
    if (!l) return setMsg({ ok: false, t: `"${raw}" مش في الطلب ده (أو اتحضّر)` });
    setMsg({ ok: true, t: `✓ ${l.name}` });
    pick(o.id, l.line, l.unit === "قطعة" ? l.qty : l.qty);
  };
  const ready = async () => {
    if (!o) return;
    const { error } = await sb.rpc("partner_ready", { p_order: o.id, p_receipt: f.receipt, p_amount: Number(f.amount), p_bags: Number(f.bags) || 1 });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    setMsg({ ok: true, t: `طلب ${o.no} جاهز للكابتن ✅` }); setF({ receipt: "", amount: "", bags: "1" }); setCur(null); load();
  };
  const col = (s: string) => L.filter((x) => (s === "new" ? !x.prep : s === "prep" ? x.prep?.status === "preparing" : x.prep?.status === "ready"));
  return (
    <>
      <div className="top"><h1>ديسباتشر الماركت</h1>
        {locs.length > 1 && <select value={loc} onChange={(e) => setLoc(e.target.value)}>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      {!o ? (
        <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {([["new", "جديد"], ["prep", "جاري التحضير"], ["ready", "جاهز للاستلام"]] as const).map(([k, t]) => (
            <div key={k} className="card"><h2 style={{ marginTop: 0 }}>{t} ({col(k).length})</h2>
              {col(k).map((x) => (<div key={x.id}>
                <button className="btn" style={{ width: "100%", height: "auto", padding: 10, marginBottom: 6, textAlign: "start", display: "block" }} onClick={() => setCur(x.id)}>
                  <b>#{x.no}</b> · {x.lines.length} صنف · {x.customer ?? ""}<div className="muted" style={{ fontSize: 12 }}>{x.near ? "كابتن واحد بيعدّي" : "بعيد — مدير الحركة بيقرر"}{x.prep?.receipt_no ? ` · إيصال ${x.prep.receipt_no}` : ""}{x.lines.some((l) => l.sub_status === "offered") ? " · ⏳ مستني رد العميل على بديل" : ""}</div>
                </button>
                {k === "ready" && (
                  <div className="row" style={{ gap: 4, marginBottom: 10 }}>
                    <button className="btn" onClick={() => bagLabels(x)}>🖨 ملصقات الشنط</button>
                    <input value={code[x.id] ?? ""} onChange={(e) => setCode({ ...code, [x.id]: e.target.value })} placeholder="كود الكابتن" inputMode="numeric" dir="ltr" style={{ width: 100 }} />
                    <button className="btn pri" onClick={() => handover(x.id)}>سلّم</button>
                  </div>)}
              </div>))}
              {!col(k).length && <div className="muted">مفيش</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><b>طلب #{o.no}</b><button className="btn" onClick={() => setCur(null)}>→ الطلبات</button></div>
          <ScanInput onScan={onScan} placeholder="امسح باركود الصنف…" />
          {o.sub_pref && <div className="muted" style={{ fontSize: 13 }}>اختيار العميل لو صنف مش موجود: <b>{o.sub_pref === "replace" ? "بدّله على طول" : o.sub_pref === "remove" ? "شيله" : "اسألني"}</b></div>}
          <table><tbody>{o.lines.map((l) => {
            const left = l.sub_deadline ? Math.max(0, Math.round((new Date(l.sub_deadline).getTime() - Date.now()) / 1000)) : 0;
            return (
            <tr key={l.line} style={{ background: l.sub_status === "offered" ? "#FFF8E1" : l.prepared == null ? undefined : l.prepared > 0 ? "#F0FAF3" : "#FDECEC" }}>
              <td><b>{l.name}</b>{l.sub_of ? <span className="pill" style={{ marginInlineStart: 6 }}>بديل</span> : null}<div className="muted" style={{ fontSize: 12 }}>{l.qty} {l.unit}</div>
                {l.sub_status === "offered" && <div style={{ fontSize: 12 }}>⏳ اتعرض {l.sub_name} بـ {l.sub_price} ج — العميل بيرد ({Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")})</div>}
                {l.sub_status === "accepted" && <div style={{ fontSize: 12, color: "#15803d" }}>✓ العميل وافق على البديل</div>}
                {(l.sub_status === "rejected" || l.sub_status === "removed") && <div style={{ fontSize: 12, color: "#b91c1c" }}>اتشال من الطلب</div>}
                {sug?.line === l.line && (
                  <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                    {sug.list.map((g) => <button key={g.item_id} className="btn" style={{ height: "auto", padding: 6, textAlign: "start" }} onClick={() => offer(o.id, l.line, g.item_id)}>اعرض {g.name} — {g.price} ج (كان {l.price} ج)</button>)}
                    {!sug.list.length && <div className="muted">مفيش بدايل قريبة من نفس القسم في الماركت</div>}
                  </div>)}
              </td>
              <td className="row" style={{ gap: 4 }}>
                {!l.sub_status && <>
                  {l.unit !== "قطعة" && <input inputMode="decimal" placeholder="الوزن" defaultValue={l.prepared ?? ""} style={{ width: 80 }} onBlur={(e) => { if (e.target.value) pick(o.id, l.line, Number(e.target.value)); }} />}
                  <button className="btn pri" onClick={() => pick(o.id, l.line, l.qty)}>اتجاب</button>
                  <button className="btn" onClick={() => pick(o.id, l.line, 0)}>مش موجود</button>
                  {l.prepared === 0 && !l.sub_of && <button className="btn" onClick={() => suggest(o.id, l.line)}>🔄 بديل</button>}
                </>}
              </td>
            </tr>); })}</tbody></table>
          <div className="row" style={{ alignItems: "end" }}>
            <label className="fld">رقم إيصال كاشير الماركت<input value={f.receipt} onChange={(e) => setF({ ...f, receipt: e.target.value })} dir="ltr" /></label>
            <label className="fld">المبلغ<input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" dir="ltr" style={{ width: 100 }} /></label>
            <label className="fld">الشنط<input value={f.bags} onChange={(e) => setF({ ...f, bags: e.target.value })} inputMode="numeric" style={{ width: 60 }} /></label>
            <button className="btn pri" onClick={ready}>جاهز للكابتن</button>
          </div>
        </div>
      )}
    </>
  );
}
