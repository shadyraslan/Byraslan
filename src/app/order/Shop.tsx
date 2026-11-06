"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { getMenu, placeOrder, type Menu } from "./actions";

type Dist = { id: number; name: string; city: string; branch: string | null; branch_name: string | null; fee: number };
const f = (n: number) => Math.round(n).toLocaleString("en-US");

export default function Shop({ districts, open, minOrder, channel, note }: { districts: Dist[]; open: boolean; minOrder: number; channel: string; note: string }) {
  const [dist, setDist] = useState<number | null>(null);
  const dd = districts.find((d) => d.id === dist);
  const loc = dd?.branch ?? null;
  const [menu, setMenu] = useState<Menu[] | null>(null);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [step, setStep] = useState<"menu" | "info">("menu");
  const [info, setInfo] = useState({ name: "", phone: "", address: "", note: "", pay: "cash" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const br = dd && dd.branch ? { name: dd.branch_name ?? "", fee: dd.fee, min_order: minOrder } : null;

  useEffect(() => {
    try { const s = localStorage.getItem("rostos-info"); if (s) { const v = JSON.parse(s); setInfo((i) => ({ ...i, name: v.name ?? "", phone: v.phone ?? "", address: v.address ?? "" })); if (v.district) setDist(Number(v.district)); } } catch {}
  }, []);
  useEffect(() => { if (loc) { setMenu(null); getMenu(loc).then(setMenu); setCart({}); } }, [loc]);

  const fams = useMemo(() => [...new Set((menu ?? []).map((m) => m.family ?? "أصناف"))], [menu]);
  const step1 = (m: Menu) => (m.sold_by === "piece" || m.unit === "قطعة" ? 1 : 0.5);
  const add = (m: Menu, d: number) => setCart((c) => { const q = Math.max(0, Math.round(((c[m.item_id] ?? 0) + d * step1(m)) * 10) / 10); const n = { ...c }; if (q) n[m.item_id] = q; else delete n[m.item_id]; return n; });
  const sub = (menu ?? []).reduce((a, m) => a + (cart[m.item_id] ?? 0) * m.price, 0);
  const count = Object.keys(cart).length;

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
        <input placeholder="ملاحظة (مثلًا: تقطيع معيّن)" value={info.note} onChange={(e) => setInfo({ ...info, note: e.target.value })} />
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
        const r = await placeOrder({ district: dd!.id, ...info, channel, lines: Object.entries(cart).map(([id, q]) => ({ item_id: Number(id), qty: q })) });
        if (!r.ok) return setErr(r.error);
        try { localStorage.setItem("rostos-info", JSON.stringify({ name: info.name, phone: info.phone, address: info.address, district: dd?.id })); } catch {}
        window.location.href = `/t/${r.token}`;
      })}>أكّد الطلب</button>
      {err && <div className="badmsg" style={{ marginTop: 8 }}>{err}</div>}
    </div>
  );

  return (
    <div className="shopbody">
      <div className="row" style={{ justifyContent: "space-between" }}><b>التوصيل لـ {dd?.name} <span className="muted" style={{ fontWeight: 400 }}>· فرع {br.name}</span></b><button className="btn" onClick={() => setDist(null)}>غيّر المنطقة</button></div>
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
          <button className="btn pri" disabled={sub < br.min_order} onClick={() => setStep("info")}>كمّل الطلب</button>
        </div>
      )}
    </div>
  );
}
