"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import ScanInput from "@/components/ScanInput";
import { boxSn, dbMsg } from "@/lib/scan";

type Line = { item_id: number; name: string; unit: string; sold_by: string; system: number | null; counted: number | null; cost: number | null; reason: string | null; diff: number | null; value: number | null; barcodes: string[] | null };
type BoxRow = { sn: number; item: string; weight: number; value?: number; status?: string; from?: string };
export type CountView = {
  id: number; no: number; status: string; location: string; family: string | null; note: string | null; at: string; by: string | null;
  submitted_at: string | null; decided_at: string | null; decided_by: string | null; decision_note: string | null;
  show_system: boolean; can_decide: boolean; reason_over: number; lines: Line[]; value_diff: number | null;
  boxes: { scanned: number; expected: number | null; missing: BoxRow[] | null; odd: BoxRow[]; by_item: { item: string; n: number; kg: number }[] };
};
const ST: Record<string, string> = { open: "بيتعدّ", submitted: "مستني اعتماد", approved: "اتعمد", rejected: "اترفض", cancelled: "اتلغى" };
const f2 = (n: number) => (Math.round(n * 1000) / 1000).toLocaleString("ar-EG");

/** شاشة العدّ: امسح العلب، اكتب المعدود لكل صنف (أو امسح باركوده يروح عليه)، ابعت — والمدير يعتمد */
export default function Counter({ v, extra, canCount }: { v: CountView; extra: { id: number; name: string; unit: string }[]; canCount: boolean }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "left" | "diff">("all");
  const [note, setNote] = useState("");
  const [add, setAdd] = useState("");
  const open = v.status === "open" && canCount;
  const bad = (t: string) => { setMsg({ ok: false, t }); try { navigator.vibrate?.(200); } catch {} };
  const run = (p: PromiseLike<{ error: { message: string } | null }>, ok?: string) => start(async () => {
    const { error } = await p;
    if (error) return bad(dbMsg(error.message));
    if (ok) setMsg({ ok: true, t: ok });
    router.refresh();
  });

  const save = (item: number, val: string, reason?: string) => {
    const qty = val.trim() === "" ? null : Number(val.replace(",", "."));
    if (qty != null && (!Number.isFinite(qty) || qty < 0)) return bad("اكتب رقم صحيح");
    run(sb.rpc("count_set", { p_count: v.id, p_item: item, p_qty: qty, p_reason: reason ?? null }));
  };

  const onScan = (raw: string) => {
    const sn = boxSn(raw);
    if (sn) {
      start(async () => {
        const { data, error } = await sb.rpc("count_scan", { p_count: v.id, p_sn: sn });
        if (error) return bad(dbMsg(error.message));
        const r = data as { dup?: boolean; item?: string; weight?: number; warn?: string | null };
        if (r.dup) return bad(`#${sn} اتمسحت قبل كده`);
        setMsg({ ok: !r.warn, t: `✓ #${sn} ${r.item} · ${r.weight} كجم${r.warn ? ` — ${r.warn}` : ""}` });
        router.refresh();
      });
      return;
    }
    // باركود صنف ← نروح على خانته
    const l = v.lines.find((x) => (x.barcodes ?? []).includes(raw.trim()));
    if (!l) return bad(`"${raw}" مش صنف في الجرد ده — ضيفه من تحت`);
    const el = document.getElementById(`q-${l.item_id}`) as HTMLInputElement | null;
    el?.scrollIntoView({ block: "center" }); el?.focus(); el?.select();
    setMsg({ ok: true, t: `${l.name} — اكتب العدد` });
  };

  const lines = useMemo(() => v.lines.filter((l) =>
    (!q || l.name.includes(q)) && (only === "all" || (only === "left" ? l.counted == null : (l.diff ?? 0) !== 0))), [v.lines, q, only]);
  const done = v.lines.filter((l) => l.counted != null).length;

  return (
    <>
      <div className="top">
        <h1>جرد #{v.no} — {v.location}{v.family ? ` · ${v.family}` : ""}</h1>
        <Link className="btn" href="/stock/count" style={{ display: "inline-grid", placeItems: "center" }}>→ كل الجرد</Link>
      </div>
      <div className="kpis">
        <div className="kpi"><span>الحالة</span><b>{ST[v.status]}</b><small>{v.by}</small></div>
        <div className="kpi"><span>أصناف اتعدّت</span><b className="num">{done}/{v.lines.length}</b></div>
        <div className="kpi"><span>علب اتمسحت</span><b className="num">{v.boxes.scanned}{v.boxes.expected != null ? ` / ${v.boxes.expected}` : ""}</b></div>
        {v.value_diff != null && <div className={`kpi${Number(v.value_diff) < 0 ? " hl" : ""}`}><span>قيمة الفرق بالتكلفة</span><b className="num">{f2(Number(v.value_diff))} ج</b></div>}
      </div>
      {v.note && <div className="note">{v.note}</div>}

      {open && (
        <div className="card" style={{ position: "sticky", top: 0, zIndex: 5 }}>
          <ScanInput onScan={onScan} placeholder="امسح ملصق العلبة أو باركود الصنف…" />
          {msg && <div className={msg.ok ? "okmsg" : "badmsg"} style={{ marginTop: 6 }}>{msg.t}</div>}
        </div>
      )}
      {!open && msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}

      {(v.boxes.scanned > 0 || (v.boxes.expected ?? 0) > 0) && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>العلب</h2>
          <div className="row" style={{ gap: 6 }}>{v.boxes.by_item.map((b) => <span key={b.item} className="pill">{b.item}: {b.n} علبة · {f2(b.kg)} كجم</span>)}</div>
          {!!v.boxes.missing?.length && (
            <details style={{ marginTop: 8 }} open={v.status !== "open"}>
              <summary><b style={{ color: "var(--bad)" }}>{v.boxes.missing.length} علبة متسجّلة هنا وماتمسحتش</b> — هتتعلّم مفقودة بعد الاعتماد</summary>
              <table><tbody>{v.boxes.missing.map((b) => <tr key={b.sn}><td dir="ltr">#{b.sn}</td><td>{b.item}</td><td className="num">{b.weight} كجم</td><td className="num">{f2(Number(b.value ?? 0))} ج</td></tr>)}</tbody></table>
            </details>
          )}
          {!!v.boxes.odd.length && (
            <details style={{ marginTop: 8 }} open>
              <summary><b>{v.boxes.odd.length} علبة مش متسجّلة هنا</b></summary>
              <table><tbody>{v.boxes.odd.map((b) => <tr key={b.sn}><td dir="ltr">#{b.sn}</td><td>{b.item}</td><td>{b.status === "stock" ? `في ${b.from} ← هتتنقل هنا` : `مسجّلة "${b.status}"${b.status === "missing" ? " ← هترجع للمخزون" : ""}`}</td></tr>)}</tbody></table>
            </details>
          )}
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row" style={{ gap: 6, marginBottom: 8 }}>
          <input placeholder="دوّر على صنف" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
          {([["all", "الكل"], ["left", "لسه ماتعدّش"], ...(v.show_system ? [["diff", "فيه فرق"]] : [])] as [typeof only, string][]).map(([k, l]) => <button key={k} className={only === k ? "btn pri" : "btn"} onClick={() => setOnly(k)}>{l}</button>)}
        </div>
        <table>
          <thead><tr><th>الصنف</th>{v.show_system && <th>السيستم</th>}<th>المعدود</th>{v.show_system && <><th>الفرق</th><th>القيمة</th></>}<th>السبب</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const need = v.reason_over > 0 && Math.abs(Number(l.value ?? 0)) > v.reason_over && !l.reason;
              return (
                <tr key={l.item_id} style={{ background: l.counted == null ? undefined : (l.diff ?? 0) !== 0 && v.show_system ? "#FFF7E6" : "#F0FAF3" }}>
                  <td><b>{l.name}</b> <span className="muted" style={{ fontSize: 12 }}>{l.unit}</span></td>
                  {v.show_system && <td className="num">{f2(Number(l.system ?? 0))}</td>}
                  <td>{open
                    ? <input id={`q-${l.item_id}`} inputMode="decimal" dir="ltr" defaultValue={l.counted ?? ""} style={{ width: 90 }} onBlur={(e) => { if (e.target.value !== String(l.counted ?? "")) save(l.item_id, e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                    : <span className="num">{l.counted == null ? "—" : f2(Number(l.counted))}</span>}</td>
                  {v.show_system && <>
                    <td className="num" style={{ color: Number(l.diff) < 0 ? "var(--bad)" : Number(l.diff) > 0 ? "var(--ok, #16a34a)" : undefined }}>{l.diff == null ? "" : f2(Number(l.diff))}</td>
                    <td className="num">{l.value == null ? "" : f2(Number(l.value))}</td>
                  </>}
                  <td>{open
                    ? <input defaultValue={l.reason ?? ""} placeholder={need ? "مطلوب سبب" : "كسر، صلاحية…"} style={{ width: 140, borderColor: need ? "var(--bad)" : undefined }} onBlur={(e) => { if (e.target.value !== (l.reason ?? "")) save(l.item_id, String(l.counted ?? ""), e.target.value); }} />
                    : <span className="muted">{l.reason}</span>}</td>
                </tr>
              );
            })}
            {!lines.length && <tr><td colSpan={6} className="muted">مفيش أصناف</td></tr>}
          </tbody>
        </table>
        {open && !!extra.length && (
          <div className="row" style={{ gap: 6, marginTop: 8 }}>
            <select value={add} onChange={(e) => setAdd(e.target.value)} style={{ flex: 1 }}><option value="">+ صنف لقيته ومش في القايمة</option>{extra.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}</select>
            <button className="btn" disabled={!add || pending} onClick={() => { save(Number(add), "0"); setAdd(""); }}>ضيف</button>
          </div>
        )}
      </div>

      {open && (
        <div className="card row" style={{ gap: 8 }}>
          <button className="btn pri" disabled={pending} onClick={() => { if (confirm(`تبعت الجرد؟ ${v.lines.length - done ? `فيه ${v.lines.length - done} صنف ماتعدّش — هيتسابوا زي ما هم.` : ""}`)) run(sb.rpc("count_submit", { p_count: v.id }), "اتبعت للاعتماد"); }}>ابعت للاعتماد</button>
          {v.show_system && <button className="btn" disabled={pending} onClick={() => { if (confirm("تلغي الجرد ده؟")) run(sb.rpc("count_decide", { p_count: v.id, p_ok: false, p_note: "اتلغى" })); }}>إلغاء الجرد</button>}
        </div>
      )}
      {v.can_decide && (
        <div className="card" style={{ display: "grid", gap: 8 }}>
          <b>الاعتماد هيعمل حركة "جرد" لكل فرق بالتكلفة، ويعلّم العلب اللي ماتمسحتش مفقودة.</b>
          <input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="row" style={{ gap: 8 }}>
            <button className="btn pri" disabled={pending} onClick={() => run(sb.rpc("count_decide", { p_count: v.id, p_ok: true, p_note: note }), "اتعمد والرصيد اتظبط")}>✅ اعتمد</button>
            <button className="btn" disabled={pending} onClick={() => run(sb.rpc("count_decide", { p_count: v.id, p_ok: false, p_note: note }), "اترفض")}>ارفض</button>
          </div>
        </div>
      )}
      {v.decided_at && <div className="note">{ST[v.status]} بواسطة {v.decided_by} — {new Date(v.decided_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}{v.decision_note ? ` · ${v.decision_note}` : ""}</div>}
    </>
  );
}
