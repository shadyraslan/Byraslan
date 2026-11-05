"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addExpense } from "../actions";
import { uploadPhoto } from "@/lib/img";

export default function NewExpense({ locs, cats, home }: { locs: { id: string; name: string }[]; cats: { id: number; name: string }[]; home: string | null }) {
  const router = useRouter();
  const [loc, setLoc] = useState(home ?? "");
  const [cat, setCat] = useState(0);
  const [amt, setAmt] = useState("");
  const [from, setFrom] = useState("cash");
  const [note, setNote] = useState("");
  const [day, setDay] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="card">
      <h2>مصروف جديد</h2>
      <div className="row">
        <label className="fld">المكان<select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">—</option>{locs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">البند<select value={cat} onChange={(e) => setCat(Number(e.target.value))}><option value={0}>—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="fld">المبلغ<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" dir="ltr" /></label>
        <label className="fld">اتدفع من<select value={from} onChange={(e) => setFrom(e.target.value)}><option value="cash">خزنة / كاش</option><option value="shift">درج الوردية بتاعتي</option><option value="bank">البنك</option></select></label>
        <label className="fld">اليوم<input type="date" value={day} onChange={(e) => setDay(e.target.value)} /></label>
      </div>
      <div className="row">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="تفاصيل" style={{ flex: "1 1 240px" }} />
        <label className="btn" style={{ display: "inline-grid", placeItems: "center" }}>{busy ? "…" : photo ? "✅ الإيصال اتصوّر" : "📷 صوّر الإيصال"}
          <input type="file" accept="image/*" capture="environment" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setBusy(true); try { setPhoto(await uploadPhoto(f, "expenses")); } catch (er) { setMsg({ ok: false, t: String(er) }); } finally { setBusy(false); } }} /></label>
        <button className="btn pri" disabled={pending || busy} onClick={() => start(async () => {
          const r = await addExpense(loc, cat, Number(amt), from, note, photo, day || null);
          if (!r.ok) return setMsg({ ok: false, t: r.error });
          setMsg({ ok: true, t: r.status === "pending" ? `اتسجل مصروف #${r.no} — أكبر من حدّك فمستني موافقة` : `اتسجل مصروف #${r.no}` });
          setAmt(""); setNote(""); setPhoto(null); router.refresh();
        })}>سجّل</button>
      </div>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}
