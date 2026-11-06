"use client";
import { useEffect, useState, useTransition } from "react";
import { editBooking, getSlots, type Slot } from "@/app/order/actions";

/** صفحة متابعة الحجز: تغيير الميعاد أو العنوان، تعديل الأصناف، أو الإلغاء — لحد المهلة */
export default function BookingBox({ token, district, when, slot, canEdit, deposit, depositPaid }: { token: string; district: number | null; when: string; slot: string; canEdit: boolean; deposit: number; depositPaid: boolean }) {
  const [open, setOpen] = useState<"time" | "addr" | "cancel" | null>(null);
  const [date, setDate] = useState(new Date(when).toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }));
  const [sl, setSl] = useState(slot);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [addr, setAddr] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => { try { const L = JSON.parse(localStorage.getItem("my-orders") ?? "[]") as string[]; if (!L.includes(token)) localStorage.setItem("my-orders", JSON.stringify([token, ...L].slice(0, 20))); } catch {} }, [token]);
  useEffect(() => { if (open === "time" && district) { setSlots(null); getSlots(district, date).then(setSlots); } }, [open, date, district]);
  const go = (o: Parameters<typeof editBooking>[0]) => start(async () => { setErr(null); const r = await editBooking(o); if (!r.ok) return setErr(r.error); location.reload(); });
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }); });
  const dn = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
  return (
    <div className="card" style={{ display: "grid", gap: 8, border: "2px solid #F5C800" }}>
      <b style={{ fontSize: 17 }}>📅 حجز يوم {new Date(when).toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", timeZone: "Africa/Cairo" })} — الساعة {slot}</b>
      {deposit > 0 && <div>{depositPaid ? `✅ العربون ${deposit} ج اتدفع` : `العربون المطلوب: ${deposit} ج`}</div>}
      {canEdit ? (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={() => setOpen(open === "time" ? null : "time")}>🕒 غيّر الميعاد</button>
          <a className="btn" href={`/order?edit=${token}`}>✏️ عدّل الأصناف</a>
          <button className="btn" onClick={() => setOpen(open === "addr" ? null : "addr")}>📍 غيّر العنوان</button>
          <button className="btn" onClick={() => setOpen(open === "cancel" ? null : "cancel")}>إلغاء الحجز</button>
        </div>
      ) : <div className="muted">التعديل خلص وقته — لو محتاج حاجة <a href={`/help?o=${token}`}><b>كلّم خدمة العملاء</b></a></div>}
      {open === "time" && (
        <>
          <div className="row" style={{ gap: 6, overflowX: "auto", flexWrap: "nowrap" }}>{days.map((d) => <button key={d} className={date === d ? "btn pri" : "btn"} style={{ flex: "none" }} onClick={() => { setDate(d); setSl(""); }}>{dn(d)}</button>)}</div>
          {slots && <div className="row" style={{ gap: 6 }}>{slots.map((x) => <button key={x.slot} className={sl === x.slot ? "btn pri" : "btn"} disabled={!x.ok} onClick={() => setSl(x.slot)}>{x.slot}</button>)}</div>}
          <button className="btn pri" disabled={pending || !sl} onClick={() => go({ token, date, slot: sl })}>احفظ الميعاد</button>
        </>
      )}
      {open === "addr" && <><textarea rows={2} value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="العنوان الجديد بالتفصيل" /><button className="btn pri" disabled={pending || !addr.trim()} onClick={() => go({ token, address: addr })}>احفظ العنوان</button></>}
      {open === "cancel" && <><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب (اختياري)" /><button className="btn" style={{ background: "#c62828", color: "#fff" }} disabled={pending} onClick={() => go({ token, cancel: true, reason })}>أيوه، الغي الحجز</button></>}
      {err && <div className="badmsg">{err}</div>}
    </div>
  );
}
