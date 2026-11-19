"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Cfg = { on?: boolean; mode?: string; avg_days?: number; cover_days?: number; safety_pct?: number; cutoff_min?: number; approve?: string };
type Ln = { loc: string; name: string; departs: string[]; travel_min: number; active: boolean };

export default function Rules({ cfg, lines, canEdit }: { cfg: Cfg; lines: Ln[]; canEdit: boolean }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [c, setC] = useState({ on: cfg.on !== false, mode: cfg.mode ?? "forecast", avg_days: String(cfg.avg_days ?? 14), cover_days: String(cfg.cover_days ?? 1), safety_pct: String(cfg.safety_pct ?? 10), cutoff_min: String(cfg.cutoff_min ?? 60), approve: cfg.approve ?? "none" });
  const [L, setL] = useState(lines.map((l) => ({ ...l, d: l.departs.join("، "), t: String(l.travel_min) })));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const save = async () => {
    setMsg(null);
    const { error } = await sb.rpc("replenish_save_cfg", {
      p_cfg: { on: c.on, mode: c.mode, avg_days: Number(c.avg_days), cover_days: Number(c.cover_days), safety_pct: Number(c.safety_pct), cutoff_min: Number(c.cutoff_min), approve: c.approve },
      p_lines: L.map((l) => ({ loc: l.loc, departs: l.d.split(/[،,\s]+/).map((x) => x.trim()).filter(Boolean).map((x) => (x.length === 4 ? "0" + x : x)), travel_min: Number(l.t) || 0, active: l.active })),
    });
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    setMsg({ ok: true, t: "اتحفظ — الحسبة الجاية خلال ٥ دقايق" }); router.refresh();
  };
  return (
    <>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>القواعد</h2>
        <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={c.on} onChange={(e) => setC({ ...c, on: e.target.checked })} disabled={!canEdit} /> الطلبات الأوتوماتيك شغالة</label>
        <div className="row">
          <label className="fld">إمتى يطلب<select value={c.mode} onChange={(e) => setC({ ...c, mode: e.target.value })} disabled={!canEdit}><option value="forecast">لو المتوقع وقت وصول العربية أقل من الحد الأدنى</option><option value="min">لما الرصيد دلوقتي يقل عن الحد الأدنى</option></select></label>
          <label className="fld">متوسط البيع من آخر (يوم)<input value={c.avg_days} onChange={(e) => setC({ ...c, avg_days: e.target.value })} inputMode="numeric" style={{ width: 80 }} disabled={!canEdit} /></label>
          <label className="fld">يطلب بيع كام يوم زيادة<input value={c.cover_days} onChange={(e) => setC({ ...c, cover_days: e.target.value })} inputMode="decimal" style={{ width: 80 }} disabled={!canEdit} /></label>
          <label className="fld">زيادة أمان %<input value={c.safety_pct} onChange={(e) => setC({ ...c, safety_pct: e.target.value })} inputMode="decimal" style={{ width: 80 }} disabled={!canEdit} /></label>
          <label className="fld">يتقفل قبل العربية بـ (دقيقة)<input value={c.cutoff_min} onChange={(e) => setC({ ...c, cutoff_min: e.target.value })} inputMode="numeric" style={{ width: 80 }} disabled={!canEdit} /></label>
          <label className="fld">الاعتماد<select value={c.approve} onChange={(e) => setC({ ...c, approve: e.target.value })} disabled={!canEdit}><option value="none">من غير اعتماد</option><option value="branch">مسؤول الفرع يعتمد</option><option value="factory">المصنع يعتمد</option></select></label>
        </div>
        <div className="muted" style={{ fontSize: 12.5 }}>لو الاعتماد مطلوب: اللي معاه صلاحية «اعتماد طلبات الفروع» بيعتمد، والطلب اللي اتغيّر بعد الاعتماد بيرجع يستنى اعتماد تاني. الطلب اللي ماتعتمدش مش بيتقفل.</div>
      </div>
      <div className="card" style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>مواعيد العربيات لكل فرع</h2>
        {L.map((l, i) => (
          <div key={l.loc} className="row" style={{ gap: 8 }}>
            <b style={{ minWidth: 110 }}>{l.name}</b>
            <label className="fld">مواعيد التحرك من المصنع<input value={l.d} onChange={(e) => setL(L.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)))} dir="ltr" placeholder="08:00، 15:00" disabled={!canEdit} style={{ width: 160 }} /></label>
            <label className="fld">مدة الوصول (دقيقة)<input value={l.t} onChange={(e) => setL(L.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))} inputMode="numeric" style={{ width: 80 }} disabled={!canEdit} /></label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={l.active} onChange={(e) => setL(L.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} disabled={!canEdit} /> شغال</label>
          </div>
        ))}
        {canEdit && <button className="btn pri" onClick={save} style={{ justifySelf: "start" }}>احفظ</button>}
        {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      </div>
    </>
  );
}
