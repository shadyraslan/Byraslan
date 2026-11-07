"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { getMenu, placeOrder, staffPlace, makeCart, getSlots, bookOrder, editBooking, setPin, type Menu, type Slot } from "./actions";

/** لينك لوكيشن (جوجل ماب/واتساب) أو "lat,lng" ← إحداثيات */
function parseLoc(t: string): { lat: number; lng: number } | null {
  const m = t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ?? t.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ?? t.match(/(-?\d{1,2}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

type Dist = { id: number; name: string; city: string; branch: string | null; branch_name: string | null; fee: number };
const f = (n: number) => Math.round(n).toLocaleString("en-US");

export type Init = { district?: number | null; cart?: Record<number, number>; info?: { name?: string; phone?: string; address?: string }; edit?: { token: string; no: number; date: string; slot: string } };
type Staff = { channel: "phone" | "whatsapp" };

/** نفس شاشة الطلب للعميل (الويب) وللموظف اللي بياخد الطلب واتساب/تليفون (staff) */
export default function Shop({ districts, open, minOrder, channel, note, init, staff, booking }: { districts: Dist[]; open: boolean; minOrder: number; channel: string; note: string; init?: Init; staff?: Staff; booking?: { on: boolean; days: number } }) {
  const edit = init?.edit;
  // اطلب دلوقتي ولا احجز لميعاد
  const [mode, setMode] = useState<"now" | "book">(edit ? "book" : "now");
  const [bdate, setBdate] = useState<string>(edit?.date ?? "");
  const [bslot, setBslot] = useState<string>(edit?.slot ?? "");
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [dist, setDist] = useState<number | null>(init?.district ?? null);
  const [done, setDone] = useState<{ no?: number; token?: string; total?: number; link?: string; when?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const dd = districts.find((d) => d.id === dist);
  const loc = dd?.branch ?? null;
  const [menu, setMenu] = useState<Menu[] | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [step, setStep] = useState<"menu" | "info">("menu");
  const [info, setInfo] = useState({ name: "", phone: "", address: "", note: "", pay: "cash" });
  const [pin, setPinXY] = useState<{ lat: number; lng: number } | null>(null);
  const [pinMsg, setPinMsg] = useState("");
  const locate = () => {
    if (!navigator.geolocation) return setPinMsg("الموبايل ده مش بيدّي المكان");
    setPinMsg("بنحدد مكانك…");
    navigator.geolocation.getCurrentPosition((p) => { setPinXY({ lat: p.coords.latitude, lng: p.coords.longitude }); setPinMsg("📍 اتحدد مكانك"); }, () => setPinMsg("ماقدرناش نحدد المكان — اكتب العنوان بالتفصيل"), { enableHighAccuracy: true, timeout: 15000 });
  };
  const pinIt = async (token?: string) => { if (token && pin) { try { await setPin(token, pin.lat, pin.lng); } catch {} } };
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const br = dd && dd.branch ? { name: dd.branch_name ?? "", fee: dd.fee, min_order: minOrder } : null;

  useEffect(() => {
    if (staff || init?.info) { if (init?.info) setInfo((i) => ({ ...i, name: init.info?.name ?? "", phone: init.info?.phone ?? "", address: init.info?.address ?? "" })); return; }
    try { const s = localStorage.getItem("rostos-info"); if (s) { const v = JSON.parse(s); setInfo((i) => ({ ...i, name: v.name ?? "", phone: v.phone ?? "", address: v.address ?? "" })); if (v.district) setDist(Number(v.district)); } } catch {}
  }, []);
  const firstLoad = useMemo(() => ({ v: true }), []);
  useEffect(() => {
    if (!loc) return;
    setMenu(null); getMenu(loc).then(setMenu);
    if (firstLoad.v && init?.cart) { setCart(init.cart); firstLoad.v = false; } else setCart({});
  }, [loc]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode === "book" && bdate && dist) { setSlots(null); getSlots(dist, bdate).then(setSlots); } }, [mode, bdate, dist]);
  const days = useMemo(() => Array.from({ length: Math.min(booking?.days ?? 14, 21) }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" }); }), [booking?.days]);
  const dayName = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); } catch { prompt("انسخ:", t); } setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const lines = () => Object.entries(cart).map(([id, q]) => ({ item_id: Number(id), qty: q }));

  const fams = useMemo(() => [...new Set((menu ?? []).map((m) => m.family ?? "أصناف"))], [menu]);
  const step1 = (m: Menu) => (m.sold_by === "piece" || m.unit === "قطعة" ? 1 : 0.5);
  const add = (m: Menu, d: number) => setCart((c) => { const q = Math.max(0, Math.round(((c[m.item_id] ?? 0) + d * step1(m)) * 10) / 10); const n = { ...c }; if (q) n[m.item_id] = q; else delete n[m.item_id]; return n; });
  const sub = (menu ?? []).reduce((a, m) => a + (cart[m.item_id] ?? 0) * m.price, 0);
  const count = Object.keys(cart).length;

  if (done) {
    const msg = done.token
      ? `أهلاً ${info.name || ""} 👋\n${done.when ? `حجزك رقم ${done.no} اتأكّد ليوم ${done.when} ✅` : `طلبك رقم ${done.no} اتسجّل في باي رسلان ✅`}\nالإجمالي التقريبي: ${f(done.total ?? 0)} ج (النهائي بالوزن الفعلي)\nتابع طلبك من هنا: ${site}/t/${done.token}\nولو محتاج أي حاجة: ${site}/help`
      : `أهلاً ${info.name || ""} 👋\nجهّزنالك السلة دي في باي رسلان 🛒\nافتح اللينك وأكّد طلبك: ${done.link}`;
    return (
      <div className="shopbody">
        <div className="okmsg">{done.token ? (done.when ? `✅ اتسجّل حجز رقم ${done.no} ليوم ${done.when}` : `✅ اتسجّل طلب رقم ${done.no} — نزل للفرع على طول`) : "✅ لينك السلة جاهز"}</div>
        <textarea readOnly value={msg} rows={6} style={{ width: "100%", marginTop: 10 }} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn pri" onClick={() => copy(msg)}>{copied ? "اتنسخ ✓" : "📋 انسخ الرسالة للعميل"}</button>
          {info.phone && <a className="btn" href={`https://wa.me/2${info.phone.replace(/\D/g, "").replace(/^2/, "")}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer">افتح واتساب العميل</a>}
          <button className="btn" onClick={() => { setDone(null); setCart({}); setStep("menu"); }}>طلب جديد</button>
        </div>
      </div>
    );
  }

  if (!br) return (
    <div className="shopbody">
      <h2>ساكن فين؟</h2>
      <div className="muted">اختار منطقتك، وهنوريك المتاح في أقرب فرع ليك وسعر التوصيل.</div>
      {!open && <div className="badmsg">الطلبات أونلاين مقفولة دلوقتي</div>}
      {[...new Set(districts.map((d) => d.city))].map((c) => (
        <div key={c}>
          <h3>{c}</h3>
          <div className="tiles">{districts.filter((d) => d.city === c).map((d) => <button key={d.id} className="tile" disabled={!open} onClick={() => setDist(d.id)}><b>{d.name}</b><small>{d.branch ? `توصيل ${d.fee} ج` : "لسه مش متغطية"}</small></button>)}</div>
        </div>
      ))}
      {dd && !dd.branch && <div className="badmsg">منطقة {dd.name} لسه مش متغطية — قريب إن شاء الله</div>}
    </div>
  );

  if (step === "info") return (
    <div className="shopbody">
      <button className="btn" onClick={() => setStep("menu")}>→ رجوع للسلة</button>
      <h2>بياناتك</h2>
      <div style={{ display: "grid", gap: 10 }}>
        <input placeholder="الاسم" value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} />
        <input placeholder="رقم الموبايل" inputMode="tel" dir="ltr" value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} />
        <div className="muted">المنطقة: <b>{dd?.name}</b></div>
        <textarea placeholder="العنوان بالتفصيل (الشارع، العمارة، الدور، الشقة، علامة مميزة)" rows={3} value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} />
        {staff
          ? <input placeholder="لينك اللوكيشن من الواتساب (اختياري)" dir="ltr" onChange={(e) => { const x = parseLoc(e.target.value); setPinXY(x); setPinMsg(x ? "📍 اتحدد المكان من اللينك" : e.target.value ? "اللينك ده مافيهوش مكان" : ""); }} />
          : <button type="button" className="btn" onClick={locate}>📍 حدّد مكاني بالظبط (أسرع في التوصيل)</button>}
        {pinMsg && <div className="muted" style={{ fontSize: 13 }}>{pinMsg}</div>}
        <input placeholder="ملاحظة (مثلًا: تقطيع معيّن)" value={info.note} onChange={(e) => setInfo({ ...info, note: e.target.value })} />
        {(booking?.on || edit) && (
          <div className="card" style={{ display: "grid", gap: 8 }}>
            {!edit && <div className="row">{([["now", "🚚 وصّله دلوقتي"], ["book", "📅 احجز لميعاد"]] as const).map(([k, l]) => <button key={k} className={mode === k ? "btn pri" : "btn"} onClick={() => setMode(k)}>{l}</button>)}</div>}
            {mode === "book" && (
              <>
                <div className="muted">اختار اليوم</div>
                <div className="row" style={{ gap: 6, overflowX: "auto", flexWrap: "nowrap" }}>{days.map((d) => <button key={d} className={bdate === d ? "btn pri" : "btn"} style={{ flex: "none" }} onClick={() => { setBdate(d); setBslot(""); }}>{dayName(d)}</button>)}</div>
                {bdate && <div className="muted">والميعاد</div>}
                {bdate && !slots && <div className="muted">بيحمّل…</div>}
                {slots && <div className="row" style={{ gap: 6 }}>{slots.map((x) => <button key={x.slot} className={bslot === x.slot ? "btn pri" : "btn"} disabled={!x.ok && !staff} onClick={() => setBslot(x.slot)}>{x.slot}{x.full ? " (اتملى)" : ""}</button>)}</div>}
                {slots && !slots.some((x) => x.ok) && <div className="muted">مفيش مواعيد متاحة اليوم ده — جرّب يوم تاني</div>}
              </>
            )}
          </div>
        )}
        <div className="row">{[["cash", "كاش عند الاستلام"], ["card", "فيزا عند الاستلام"], ["instapay", "إنستاباي"]].map(([k, l]) => <button key={k} className={info.pay === k ? "btn pri" : "btn"} onClick={() => setInfo({ ...info, pay: k })}>{l}</button>)}</div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><span>الأصناف (تقريبي)</span><b className="num">{f(sub)}</b></div>
        <div className="row" style={{ justifyContent: "space-between" }}><span>التوصيل</span><b className="num">{f(br.fee)}</b></div>
        <div className="row" style={{ justifyContent: "space-between", fontSize: 18 }}><span>الإجمالي التقريبي</span><b className="num">{f(sub + br.fee)} ج</b></div>
        <div className="muted" style={{ fontSize: 12.5 }}>{note}</div>
      </div>
      <button className="btn pri" style={{ width: "100%", height: 50, fontSize: 17 }} disabled={pending} onClick={() => start(async () => {
        setErr(null);
        if (mode === "book" && (!bdate || !bslot)) return setErr("اختار يوم وميعاد الحجز");
        if (edit) {
          const r = await editBooking({ token: edit.token, lines: lines(), date: bdate, slot: bslot, address: info.address, note: info.note });
          if (!r.ok) return setErr(r.error);
          if (staff) return setDone({ no: edit.no, token: edit.token, total: r.total, when: `${dayName(bdate)} ${bslot}` });
          window.location.href = `/t/${edit.token}`; return;
        }
        if (mode === "book") {
          const r = await bookOrder({ district: dd!.id, ...info, channel: staff?.channel ?? channel, lines: lines(), date: bdate, slot: bslot });
          if (!r.ok) return setErr(r.error);
          await pinIt(r.token);
          if (staff) return setDone({ no: r.no, token: r.token, total: r.total, when: `${dayName(bdate)} ${bslot}` });
          try { const L = JSON.parse(localStorage.getItem("my-orders") ?? "[]") as string[]; localStorage.setItem("my-orders", JSON.stringify([r.token, ...L].slice(0, 20))); } catch {}
          try { localStorage.setItem("rostos-info", JSON.stringify({ name: info.name, phone: info.phone, address: info.address, district: dd?.id })); } catch {}
          window.location.href = `/t/${r.token}`; return;
        }
        if (staff) {
          const r = await staffPlace({ district: dd!.id, ...info, channel: staff.channel, lines: lines() });
          if (!r.ok) return setErr(r.error);
          await pinIt(r.token);
          return setDone({ no: r.no, token: r.token, total: r.total });
        }
        const r = await placeOrder({ district: dd!.id, ...info, channel, lines: lines() });
        if (!r.ok) return setErr(r.error);
        await pinIt(r.token);
        try { const L = JSON.parse(localStorage.getItem("my-orders") ?? "[]") as string[]; localStorage.setItem("my-orders", JSON.stringify([r.token, ...L].slice(0, 20))); } catch {}
        try { localStorage.setItem("rostos-info", JSON.stringify({ name: info.name, phone: info.phone, address: info.address, district: dd?.id })); } catch {}
        window.location.href = `/t/${r.token}`;
      })}>{edit ? "احفظ التعديل" : mode === "book" ? (staff ? "سجّل الحجز" : "أكّد الحجز") : staff ? "سجّل الطلب" : "أكّد الطلب"}</button>
      {err && <div className="badmsg" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );

  return (
    <div className="shopbody">
      {edit && <div className="okmsg">✏️ بتعدّل حجز رقم {edit.no} — غيّر الأصناف وكمّل</div>}
      <div className="row" style={{ justifyContent: "space-between" }}><b>التوصيل لـ {dd?.name} <span className="muted" style={{ fontWeight: 400 }}>· فرع {br.name}</span></b>{!edit && !staff && <button className="btn" onClick={() => setDist(null)}>غيّر المنطقة</button>}</div>
      {!menu && <div className="muted">بيحمّل…</div>}
      {menu && !menu.length && <div className="muted">مفيش أصناف متاحة دلوقتي</div>}
      {fams.map((fm) => (
        <div key={fm}>
          <h3>{fm}</h3>
          {(menu ?? []).filter((m) => (m.family ?? "أصناف") === fm).map((m) => {
            const q = cart[m.item_id] ?? 0, out = m.available <= 0;
            return (
              <div key={m.item_id} className="shopitem" style={out ? { opacity: 0.45 } : undefined}>
                <div><b>{m.name}</b><div className="muted num">{f(m.price)} ج / {m.unit}</div>{out && <small style={{ color: "var(--bad)" }}>خلص</small>}</div>
                {q ? <div className="qty"><button onClick={() => add(m, -1)}>−</button><b className="num">{q}</b><button onClick={() => add(m, 1)} disabled={out}>+</button></div>
                  : <button className="btn pri" disabled={out} onClick={() => add(m, 1)}>أضف</button>}
              </div>
            );
          })}
        </div>
      ))}
      {count > 0 && (
        <div className="cartbar">
          <div><b>{count} صنف</b> · <span className="num">{f(sub)} ج</span>{sub < br.min_order && <div style={{ fontSize: 12 }}>أقل طلب {br.min_order} ج</div>}</div>
          {staff && <button className="btn" disabled={pending} onClick={() => start(async () => {
            setErr(null);
            const r = await makeCart({ district: dd!.id, lines: lines(), phone: info.phone, name: info.name, address: info.address });
            if (!r.ok) return setErr(r.error);
            setDone({ link: `${site}/order?c=${r.id}` });
          })}>🔗 ابعت لينك السلة</button>}
          <button className="btn pri" disabled={sub < br.min_order} onClick={() => setStep("info")}>كمّل الطلب</button>
        </div>
      )}
    </div>
  );
}
