"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Sup = { whatsapp?: string; phone?: string; hours?: string; faq?: [string, string][] };
type Msg = { id: number; from: "customer" | "staff" | "bot"; body: string | null; photo: boolean; at: string; who: string | null };
type Thread = { no: number; status: string; topic: string; rating: number | null; order: { no: number; token: string; status: string } | null; messages: Msg[] };
type Tk = { no: number; token: string; status: string; topic: string; last_msg_at: string; last_from: string; preview: string | null };

const TOPICS: [string, string, string][] = [
  ["track", "📦", "تتبّع طلبي"], ["issue", "⚠️", "مشكلة في طلب"], ["refund", "↩️", "استرجاع أو تعويض"],
  ["product", "🥩", "سؤال عن صنف أو سعر"], ["delivery", "🚚", "التوصيل والمواعيد"], ["agent", "🙋", "كلّم موظف"],
];
const ST: Record<string, string> = { new: "اتبعتت", open: "بنتابعها", waiting: "مستنيين ردك", solved: "اتحلّت", closed: "اتقفلت" };
const t2 = (s: string) => new Date(s).toLocaleString("ar-EG", { hour: "numeric", minute: "2-digit", day: "numeric", month: "short" });
const ls = { get: (k: string) => { try { return JSON.parse(localStorage.getItem(k) ?? "null"); } catch { return null; } }, set: (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

export default function Help({ support, openToken, orderToken }: { support: Sup; openToken: string | null; orderToken: string | null }) {
  const sb = supabaseBrowser();
  const [view, setView] = useState<"home" | "new" | "thread">(openToken ? "thread" : orderToken ? "new" : "home");
  const [topic, setTopic] = useState<string>(orderToken ? "issue" : "agent");
  const [tok, setTok] = useState<string | null>(openToken);
  const [list, setList] = useState<Tk[]>([]);
  const [orders, setOrders] = useState<{ token: string; no: number; status: string }[]>([]);
  const [th, setTh] = useState<Thread | null>(null);
  const [me, setMe] = useState({ name: "", phone: "" });
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [ord, setOrd] = useState<string | null>(orderToken);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [rate, setRate] = useState(0);
  const end = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const toks = (ls.get("cs-tickets") ?? []) as string[];
    if (openToken && !toks.includes(openToken)) { toks.unshift(openToken); ls.set("cs-tickets", toks); }
    if (toks.length) { const { data } = await sb.rpc("cs_list", { p_tokens: toks }); setList((data ?? []) as Tk[]); }
    const os = (ls.get("my-orders") ?? []) as string[];
    const out: { token: string; no: number; status: string }[] = [];
    for (const t of os.slice(0, 6)) { const { data } = await sb.rpc("track_order", { p_token: t }); const o = data as { no?: number; status?: string } | null; if (o?.no) out.push({ token: t, no: o.no, status: o.status ?? "" }); }
    setOrders(out);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const i = ls.get("rostos-info"); if (i) setMe({ name: i.name ?? "", phone: i.phone ?? "" }); loadList(); }, [loadList]);

  const loadThread = useCallback(async () => {
    if (!tok) return;
    const { data } = await sb.rpc("cs_thread", { p_token: tok });
    setTh(data as Thread);
  }, [tok]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (view !== "thread" || !tok) return;
    loadThread(); const i = setInterval(loadThread, 6000); return () => clearInterval(i);
  }, [view, tok, loadThread]);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [th?.messages.length]);

  const up = async (): Promise<string | null> => {
    if (!photo) return null;
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${(photo.name.split(".").pop() || "jpg").toLowerCase()}`;
    const { error } = await sb.storage.from("support").upload(path, photo, { contentType: photo.type || "image/jpeg" });
    if (error) throw new Error("الصورة ماترفعتش — جرّب تاني");
    return path;
  };
  const open = async () => {
    setErr(null);
    if (me.phone.replace(/\D/g, "").length < 10) return setErr("اكتب رقم موبايلك عشان نقدر نوصلّك");
    if (!text.trim() && !photo) return setErr("اكتب رسالتك");
    setBusy(true);
    try {
      const p = await up();
      const { data, error } = await sb.rpc("cs_open", { p_phone: me.phone, p_name: me.name, p_topic: topic, p_order_token: ord, p_text: text, p_channel: "web", p_photo: p });
      if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""));
      const r = data as { token: string };
      ls.set("cs-tickets", [r.token, ...((ls.get("cs-tickets") ?? []) as string[])].slice(0, 30));
      ls.set("rostos-info", { ...(ls.get("rostos-info") ?? {}), name: me.name, phone: me.phone });
      setText(""); setPhoto(null); setTok(r.token); setView("thread"); loadList();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const send = async () => {
    if (!tok || (!text.trim() && !photo)) return;
    setBusy(true); setErr(null);
    try {
      const p = await up();
      const { error } = await sb.rpc("cs_send", { p_token: tok, p_text: text, p_photo: p });
      if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, ""));
      setText(""); setPhoto(null); loadThread();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const doRate = async (n: number) => { setRate(n); if (tok) { await sb.rpc("cs_rate", { p_token: tok, p_rating: n, p_note: "" }); loadThread(); } };

  if (view === "thread" && tok) return (
    <div className="shopbody" style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <button className="btn" onClick={() => { setView("home"); setTh(null); loadList(); }}>→ رجوع</button>
        {th && <b>تذكرة {th.no} · {ST[th.status]}</b>}
      </div>
      {th?.order && <a className="card" href={`/t/${th.order.token}`}>طلب رقم {th.order.no} — تابعه ←</a>}
      <div style={{ display: "grid", gap: 8 }}>
        {th?.messages.map((m) => (
          <div key={m.id} style={{ justifySelf: m.from === "customer" ? "start" : "end", maxWidth: "85%", background: m.from === "customer" ? "#FFF3C4" : m.from === "bot" ? "#F1F0EA" : "#fff", border: "1px solid #E3E0D3", borderRadius: 14, padding: "8px 12px" }}>
            {m.from === "staff" && <div style={{ fontSize: 12, color: "#7A6200", fontWeight: 700 }}>{m.who ?? "خدمة العملاء"}</div>}
            {m.body && <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>}
            {m.photo && <div className="muted" style={{ fontSize: 12 }}>📷 صورة</div>}
            <div className="muted" style={{ fontSize: 11 }}>{t2(m.at)}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {th && (th.status === "solved" || th.status === "closed") && !th.rating && (
        <div className="card" style={{ textAlign: "center" }}>قيّم الخدمة<div style={{ fontSize: 30 }}>{[1, 2, 3, 4, 5].map((n) => <span key={n} onClick={() => doRate(n)} style={{ cursor: "pointer" }}>{n <= rate ? "★" : "☆"}</span>)}</div></div>
      )}
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="اكتب رسالتك…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <label className="btn" style={{ cursor: "pointer" }}>📷<input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
        <button className="btn pri" onClick={send} disabled={busy}>ابعت</button>
      </div>
      {photo && <div className="muted">📷 {photo.name}</div>}
      {err && <div className="badmsg">{err}</div>}
    </div>
  );

  if (view === "new") return (
    <div className="shopbody" style={{ display: "grid", gap: 10 }}>
      <button className="btn" onClick={() => setView("home")}>→ رجوع</button>
      <h2 style={{ margin: 0 }}>{TOPICS.find((t) => t[0] === topic)?.[2]}</h2>
      {(topic === "issue" || topic === "refund" || topic === "track") && !!orders.length && (
        <div>
          <div className="muted">أنهي طلب؟</div>
          <div className="row" style={{ gap: 6 }}>{orders.map((o) => <button key={o.token} className={ord === o.token ? "btn pri" : "btn"} onClick={() => setOrd(ord === o.token ? null : o.token)}>طلب {o.no}</button>)}</div>
        </div>
      )}
      <input placeholder="اسمك" value={me.name} onChange={(e) => setMe({ ...me, name: e.target.value })} />
      <input placeholder="رقم موبايلك" inputMode="tel" dir="ltr" value={me.phone} onChange={(e) => setMe({ ...me, phone: e.target.value })} />
      <textarea placeholder={topic === "issue" ? "إيه اللي حصل؟ (وصوّر لو تقدر)" : "اكتب رسالتك"} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      <label className="btn" style={{ cursor: "pointer", justifySelf: "start" }}>📷 {photo ? photo.name : "ضيف صورة"}<input type="file" accept="image/*" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
      <button className="btn pri" style={{ height: 50 }} onClick={open} disabled={busy}>{busy ? "بيتبعت…" : "ابعت"}</button>
      {err && <div className="badmsg">{err}</div>}
    </div>
  );

  return (
    <div className="shopbody" style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>إزاي نقدر نساعدك؟ 👋</h2>
      {support.hours && <div className="muted">مواعيدنا: {support.hours}</div>}
      <div className="tiles">
        {TOPICS.map(([k, ic, l]) => (
          <button key={k} className="tile" onClick={() => {
            if (k === "track" && orders.length === 1) { window.location.href = `/t/${orders[0].token}`; return; }
            setTopic(k); setView("new");
          }}><b style={{ fontSize: 22 }}>{ic}</b><b>{l}</b></button>
        ))}
      </div>
      {!!orders.length && (
        <div className="card">
          <b>طلباتك</b>
          {orders.map((o) => <a key={o.token} href={`/t/${o.token}`} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}><span>طلب {o.no}</span><span className="muted">تابع ←</span></a>)}
        </div>
      )}
      {!!list.length && (
        <div className="card">
          <b>رسايلك</b>
          {list.map((t) => (
            <div key={t.token} onClick={() => { setTok(t.token); setView("thread"); }} style={{ cursor: "pointer", padding: "8px 0", borderTop: "1px solid #eee" }}>
              <div className="row" style={{ justifyContent: "space-between" }}><b>تذكرة {t.no}</b><span style={{ color: t.last_from === "staff" ? "#16A34A" : "#888" }}>{t.last_from === "staff" ? "رد جديد" : ST[t.status]}</span></div>
              <div className="muted" style={{ fontSize: 13 }}>{t.preview}</div>
            </div>
          ))}
        </div>
      )}
      {!!support.faq?.length && (
        <div className="card">
          <b>أسئلة متكررة</b>
          {support.faq.map(([q, a]) => <details key={q} style={{ padding: "6px 0" }}><summary>{q}</summary><div className="muted">{a}</div></details>)}
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        {support.whatsapp && <a className="btn" href={`https://wa.me/${support.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">واتساب</a>}
        {support.phone && <a className="btn" href={`tel:${support.phone}`}>اتصل بينا</a>}
      </div>
    </div>
  );
}
