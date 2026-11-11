"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { receivePo, requestOverride, type RecvLine } from "../../actions";
import { uploadPhoto } from "@/lib/img";
import ScanInput from "@/components/ScanInput";
import { supabaseBrowser } from "@/lib/supabase/client";

export type RLine = { line: number; item_id: number; item: string; unit: string; qty: number; left: number; price: number; ver: number | null; checks: string[]; certs: string[]; temp_max: number | null; min_days: number };

export default function Receive({ po, poNo, lines, approved, codes, canLink }: { po: number; poNo: number; lines: RLine[]; approved: { id: number; reason: string }[]; codes: [string, number][]; canLink: boolean }) {
  const router = useRouter();
  const [L, setL] = useState<RecvLine[]>(lines.map((l) => ({ line: l.line, weighed: 0, rejected: 0, price: l.price, temp: null, expires: null, note: "", checks: l.checks.map((t) => ({ t, ok: undefined as unknown as boolean })), docs: l.certs.map((n) => ({ n })) })));
  const [inv, setInv] = useState("");
  const [viol, setViol] = useState<string[] | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [done, setDone] = useState<{ no: number; lots: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (i: number, p: Partial<RecvLine>) => setL((X) => X.map((x, j) => (j === i ? { ...x, ...p } : x)));
  // المسح: كل مسحة لصنف بالقطعة = +1، والباركود المش معروف يتربط بصنف من الأمر
  const [C, setC] = useState(() => new Map(codes));
  const [unk, setUnk] = useState<string | null>(null);
  const [hit, setHit] = useState<number | null>(null);
  const bump = (i: number) => {
    const d = lines[i];
    setHit(i); setTimeout(() => setHit(null), 700);
    if (d.unit === "كجم") return setMsg({ ok: true, t: `${d.item} — اكتب الوزن من الميزان` });
    setL((X) => X.map((x, j) => (j === i ? { ...x, weighed: (x.weighed || 0) + 1 } : x)));
    setMsg({ ok: true, t: `✓ ${d.item} — ${(L[i].weighed || 0) + 1} من ${d.left}` });
  };
  const onScan = (raw: string) => {
    const code = raw.trim(), it = C.get(code);
    const i = it != null ? lines.findIndex((d) => d.item_id === it) : -1;
    if (i >= 0) { setUnk(null); return bump(i); }
    if (it != null) return setMsg({ ok: false, t: "الصنف ده مش في أمر التوريد ده" });
    setUnk(code); setMsg(null);
  };
  const link = async (i: number) => {
    if (!unk) return;
    const { error } = await supabaseBrowser().rpc("barcode_link", { p_code: unk, p_item: lines[i].item_id });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    setC((m) => new Map(m).set(unk, lines[i].item_id)); setUnk(null); bump(i);
  };

  const ready = () => {
    for (const [i, l] of L.entries()) {
      if (!l.weighed) continue;
      const d = lines[i];
      if (l.checks.some((c) => c.ok === undefined)) return `${d.item}: جاوب على كل بنود الفحص`;
      if (l.docs.some((x) => !x.photo && !x.missing)) return `${d.item}: صوّر كل مستند أو علّم إنه مش موجود`;
      if (d.temp_max != null && l.temp == null) return `${d.item}: اكتب الحرارة`;
    }
    if (!L.some((l) => l.weighed > 0)) return "اكتب الوزن لصنف واحد على الأقل";
    return null;
  };
  const submit = (r: string | null, ov: number | null) => start(async () => {
    const e = ready(); if (e) return setMsg({ ok: false, t: e });
    const res = await receivePo(po, L.filter((l) => l.weighed > 0), r, ov, inv || null);
    if (!res.ok) return setMsg({ ok: false, t: res.error });
    if (!res.no) { setViol(res.violations); setMsg(r ? { ok: false, t: "مش معاك صلاحية التجاوز للقيمة دي — ابعت طلب تجاوز" } : null); return; }
    setDone({ no: res.no, lots: res.lots }); setViol(null); setMsg(null); router.refresh();
  });

  if (done) return (
    <div className="card">
      <div className="okmsg">اتسجل إذن الاستلام GRN-{done.no} — {done.lots.length} لوت دخلوا المخزن الرئيسي</div>
      <a className="btn pri" href={`/purchasing/receipts/${done.no}?by=no`} style={{ display: "inline-grid", placeItems: "center", marginTop: 8 }}>اطبع ملصقات اللوت</a>
    </div>
  );

  return (
    <>
      <div className="card" style={{ display: "grid", gap: 6 }}>
        <ScanInput onScan={onScan} placeholder="امسح باركود الصنف (كل مسحة = قطعة)…" />
        {unk && (
          <div className="badmsg" style={{ display: "grid", gap: 6 }}>
            <div>الباركود <b dir="ltr">{unk}</b> مش متسجّل على أي صنف.</div>
            {canLink ? <div className="row" style={{ gap: 4 }}>{lines.map((d, i) => <button key={d.line} className="btn" onClick={() => link(i)}>ده {d.item}</button>)}<button className="btn" onClick={() => setUnk(null)}>تجاهل</button></div>
              : <div>اطلب من حد معاه صلاحية «ربط الباركود» يربطه، أو اكتب العدد بإيدك.</div>}
          </div>)}
      </div>
      {lines.map((d, i) => {
        const l = L[i];
        return (
          <div key={d.line} className="card" style={hit === i ? { outline: "3px solid #16a34a" } : undefined}>
            <h2>{d.item} <span className="muted num" style={{ fontSize: 13 }}>المطلوب {d.left} {d.unit} · {d.ver ? `مواصفة v${d.ver}` : "⚠️ المواصفة مش معتمدة"}</span></h2>
            <div className="row">
              <label className="fld">الوزن على الميزان<input value={l.weighed || ""} onChange={(e) => set(i, { weighed: Number(e.target.value) || 0 })} inputMode="decimal" dir="ltr" /></label>
              <label className="fld">المرفوض<input value={l.rejected || ""} onChange={(e) => set(i, { rejected: Number(e.target.value) || 0 })} inputMode="decimal" dir="ltr" /></label>
              <label className="fld">سعر الفاتورة<input value={l.price || ""} onChange={(e) => set(i, { price: Number(e.target.value) || 0 })} inputMode="decimal" dir="ltr" /></label>
              {d.temp_max != null && <label className="fld">الحرارة ° (الحد {d.temp_max})<input value={l.temp ?? ""} onChange={(e) => set(i, { temp: e.target.value === "" ? null : Number(e.target.value) })} inputMode="decimal" dir="ltr" /></label>}
              <label className="fld">تاريخ الصلاحية{d.min_days ? ` (≥ ${d.min_days} يوم)` : ""}<input type="date" value={l.expires ?? ""} onChange={(e) => set(i, { expires: e.target.value || null })} /></label>
            </div>
            {l.checks.length > 0 && <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 13 }}>الفحص الإجباري</div>
              {l.checks.map((c, k) => (
                <div key={k} className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", padding: "4px 0" }}>
                  <span>{c.t}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <button className={c.ok === true ? "btn pri" : "btn"} onClick={() => set(i, { checks: l.checks.map((x, j) => (j === k ? { ...x, ok: true } : x)) })}>✓ مطابق</button>
                    <button className={c.ok === false ? "btn pri" : "btn"} style={c.ok === false ? { background: "var(--bad)" } : undefined} onClick={() => set(i, { checks: l.checks.map((x, j) => (j === k ? { ...x, ok: false } : x)) })}>✗ مش مطابق</button>
                  </span>
                </div>
              ))}
            </div>}
            {l.docs.length > 0 && <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 13 }}>المستندات</div>
              {l.docs.map((x, k) => (
                <div key={k} className="row" style={{ justifyContent: "space-between", borderBottom: "1px solid var(--line)", padding: "4px 0" }}>
                  <span>{x.n} {x.photo ? "✅ اتصوّرت" : x.missing ? "❌ مش موجودة" : ""}</span>
                  <span className="row" style={{ gap: 6 }}>
                    <label className="btn" style={{ display: "inline-grid", placeItems: "center" }}>{busy === `${i}-${k}` ? "…" : "📷 صوّر"}
                      <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(`${i}-${k}`); try { const p = await uploadPhoto(f, `receipts/PO-${poNo}`); set(i, { docs: l.docs.map((y, j) => (j === k ? { n: y.n, photo: p } : y)) }); } catch (er) { setMsg({ ok: false, t: String(er) }); } finally { setBusy(null); } }} /></label>
                    <button className="btn" onClick={() => set(i, { docs: l.docs.map((y, j) => (j === k ? { n: y.n, missing: true } : y)) })}>مش موجودة</button>
                  </span>
                </div>
              ))}
            </div>}
          </div>
        );
      })}
      <div className="card row">
        <label className="fld">رقم فاتورة المورد<input value={inv} onChange={(e) => setInv(e.target.value)} dir="ltr" /></label>
        <button className="btn pri" disabled={pending} onClick={() => submit(null, null)}>سجّل الاستلام</button>
        {approved.map((a) => <button key={a.id} className="btn" disabled={pending} onClick={() => submit(null, a.id)}>استلم بالتجاوز الموافق عليه #{a.id}</button>)}
      </div>
      {viol && (
        <div className="card" style={{ borderColor: "var(--bad)" }}>
          <h2 style={{ color: "var(--bad)" }}>السيستم رافض الاستلام</h2>
          {viol.map((v, k) => <div key={k}>• {v}</div>)}
          <label className="fld" style={{ display: "grid", marginTop: 8 }}>السبب<textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></label>
          <div className="row">
            <button className="btn pri" disabled={pending} onClick={() => submit(reason, null)}>استلم بتجاوز (لو معايا صلاحية)</button>
            <button className="btn" disabled={pending} onClick={() => start(async () => {
              const val = L.reduce((a, l) => a + (l.weighed - l.rejected) * l.price, 0);
              const r = await requestOverride(po, poNo, viol, val, reason);
              setMsg(r.ok ? { ok: true, t: `اتبعت طلب التجاوز #${r.id} — أول ما يتوافق عليه ارجع هنا واضغط "استلم بالتجاوز"` } : { ok: false, t: r.error });
            })}>ابعت طلب تجاوز</button>
            <button className="btn" onClick={() => setViol(null)}>ارجع أعدّل</button>
          </div>
        </div>
      )}
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </>
  );
}
