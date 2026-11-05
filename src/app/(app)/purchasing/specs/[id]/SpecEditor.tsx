"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveSpec, approveSpec, type SpecIn } from "../../actions";
import { uploadPhoto, photoUrl } from "@/lib/img";

function Photo({ label, path, onChange, edit }: { label: string; path: string | null; onChange: (p: string) => void; edit: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (path) photoUrl(path).then(setUrl); else setUrl(null); }, [path]);
  return (
    <div style={{ flex: "1 1 200px" }}>
      <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{label}</div>
      <div style={{ aspectRatio: "4/3", border: "1px dashed var(--line)", borderRadius: 10, display: "grid", placeItems: "center", overflow: "hidden", background: "var(--bg)" }}>
        {url ? <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span className="muted">{busy ? "بيترفع…" : "مفيش صورة"}</span>}
      </div>
      {edit && <label className="btn" style={{ marginTop: 6, display: "inline-grid", placeItems: "center" }}>📷 صوّر / اختار
        <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { onChange(await uploadPhoto(f, "specs")); } finally { setBusy(false); } }} /></label>}
    </div>
  );
}

export default function SpecEditor({ item, init, edit, qa, dirty }: { item: number; init: SpecIn; edit: boolean; qa: boolean; dirty: boolean }) {
  const router = useRouter();
  const [s, setS] = useState<SpecIn>(init);
  const [what, setWhat] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  const f = (k: keyof SpecIn) => ({ value: (s[k] ?? "") as string, disabled: !edit, onChange: (e: { target: { value: string } }) => setS({ ...s, [k]: e.target.value }) });
  return (
    <div className="card">
      <h2>المواصفة</h2>
      <div className="row">
        <label className="fld">البراند / النوع المعتمد<input {...f("brand")} /></label>
        <label className="fld">الحجم / الوزن المقبول<input {...f("size")} /></label>
        <label className="fld">أقصى حرارة عند الاستلام °<input {...f("temp_max")} inputMode="decimal" dir="ltr" placeholder="فاضي = مش مبرّد" /></label>
        <label className="fld">أقل صلاحية متبقية (يوم)<input {...f("min_shelf_days")} inputMode="numeric" dir="ltr" /></label>
        <label className="fld">نسبة الهالك المتوقعة %<input {...f("waste_pct")} inputMode="decimal" dir="ltr" /></label>
      </div>
      <label className="fld" style={{ display: "grid" }}>الوصف<textarea {...f("description")} rows={3} /></label>
      <div className="row" style={{ alignItems: "stretch" }}>
        <label className="fld" style={{ flex: "1 1 260px", display: "grid" }}>بنود الفحص الإجباري (كل بند في سطر)<textarea {...f("checks")} rows={5} placeholder={"اللون طبيعي\nمفيش ريحة\nالتغليف سليم"} /></label>
        <label className="fld" style={{ flex: "1 1 260px", display: "grid" }}>المستندات المطلوبة مع كل شحنة (كل واحد في سطر)<textarea {...f("certs")} rows={5} placeholder={"شهادة صحية\nشهادة ذبح حلال"} /></label>
      </div>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Photo label="✅ الشكل المقبول" path={s.img_ok} edit={edit} onChange={(p) => setS({ ...s, img_ok: p })} />
        <Photo label="❌ الشكل المرفوض" path={s.img_bad} edit={edit} onChange={(p) => setS({ ...s, img_bad: p })} />
      </div>
      <div className="row">
        {edit && <button className="btn pri" disabled={pending} onClick={() => start(async () => { const r = await saveSpec(item, s); setMsg(r.ok ? { ok: true, t: "اتحفظ — مستني اعتماد الجودة" } : { ok: false, t: r.error }); router.refresh(); })}>حفظ</button>}
        {qa && dirty && <>
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="إيه اللي اتغير؟" style={{ flex: "1 1 200px" }} />
          <button className="btn pri" disabled={pending} onClick={() => start(async () => { const r = await approveSpec(item, what); setMsg(r.ok ? { ok: true, t: `اتعتمدت النسخة v${r.v}` } : { ok: false, t: r.error }); router.refresh(); })}>اعتماد الجودة</button>
        </>}
        <button className="btn" onClick={() => window.print()}>🖨️ طباعة / PDF للمورد</button>
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}
