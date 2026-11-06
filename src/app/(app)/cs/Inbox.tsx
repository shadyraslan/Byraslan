"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { photoUrl } from "@/lib/img";

type T = { id: number; no: number; phone: string; name: string | null; channel: string; topic: string; status: string; assigned_to: string | null; created_at: string; last_msg_at: string; last_from: string; first_reply_at: string | null; rating: number | null; order_id: number | null };
type M = { id: number; sender: string; staff_id: string | null; body: string | null; photo: string | null; at: string };
type Cust = { found: boolean; name: string | null; addresses: { label: string | null; address: string; district: string | null }[]; orders: { no: number; token: string; status: string; channel: string; at: string; total: number; lines: { name: string; qty: number }[] | null }[]; tickets: { no: number; status: string; topic: string }[] };

const TOP: Record<string, string> = { track: "تتبّع", issue: "مشكلة", refund: "استرجاع/تعويض", product: "سؤال صنف", delivery: "توصيل", agent: "كلّم موظف", other: "أخرى" };
const ST: Record<string, string> = { new: "جديدة", open: "بنتابعها", waiting: "مستنيين العميل", solved: "اتحلّت", closed: "اتقفلت" };
const CH: Record<string, string> = { app: "📱 تطبيق", web: "🌐 ويب", whatsapp: "🟢 واتساب", phone: "☎️ تليفون" };
const OS: Record<string, string> = { new: "جديد", accepted: "اتقبل", preparing: "بيتجهّز", ready: "جاهز", out: "مع الطيار", delivered: "اتسلّم", cancelled: "اتلغى" };
const ago = (s: string) => { const m = Math.round((Date.now() - new Date(s).getTime()) / 60000); return m < 60 ? `${m} د` : m < 1440 ? `${Math.round(m / 60)} س` : `${Math.round(m / 1440)} يوم`; };
function beep() { try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 740; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.25); setTimeout(() => c.close(), 500); } catch {} }

/** صندوق التذاكر: القايمة، الشات، كارت العميل، ردود جاهزة، الحالة، التوزيع */
export default function Inbox({ me, canned, sla, agents, manage, openId }: { me: string; canned: string[]; sla: number; agents: { id: string; name: string }[]; manage: boolean; openId: number | null }) {
  const sb = supabaseBrowser();
  const [filter, setFilter] = useState<"open" | "mine" | "late" | "all">("open");
  const [list, setList] = useState<T[]>([]);
  const [cur, setCur] = useState<number | null>(openId);
  const [msgs, setMsgs] = useState<M[]>([]);
  const [cust, setCust] = useState<Cust | null>(null);
  const [text, setText] = useState("");
  const [note, setNote] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const seen = useRef<Map<number, string>>(new Map());
  const AN = new Map(agents.map((a) => [a.id, a.name]));
  const t = list.find((x) => x.id === cur) ?? null;
  const late = (x: T) => x.last_from === "customer" && ["new", "open"].includes(x.status) && Date.now() - new Date(x.last_msg_at).getTime() > sla * 60000;

  const load = useCallback(async () => {
    let q = sb.from("support_tickets").select("*").order("last_msg_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.in("status", ["new", "open", "waiting"]);
    if (filter === "mine") q = q.eq("assigned_to", me);
    const { data } = await q;
    const L = (data ?? []) as T[];
    // رنة لو فيه رسالة جديدة من عميل
    let ring = false;
    for (const x of L) { const p = seen.current.get(x.id); if (seen.current.size && x.last_from === "customer" && p !== x.last_msg_at) ring = true; seen.current.set(x.id, x.last_msg_at); }
    if (ring) beep();
    setList(filter === "late" ? L.filter(late) : L);
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, [load]);

  const loadThread = useCallback(async () => {
    if (!cur) return;
    const { data } = await sb.from("support_messages").select("*").eq("ticket_id", cur).order("id");
    setMsgs((data ?? []) as M[]);
  }, [cur]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMsgs([]); loadThread(); const i = setInterval(loadThread, 6000); return () => clearInterval(i); }, [loadThread]);
  useEffect(() => { setCust(null); if (t?.phone) sb.rpc("cs_customer", { p_phone: t.phone }).then(({ data }) => setCust(data as Cust)); }, [t?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const reply = async (status?: string) => {
    if (!cur) return;
    setErr(null);
    const { error } = await sb.rpc("cs_reply", { p_ticket: cur, p_text: text, p_status: status ?? null, p_note: note });
    if (error) return setErr(error.message.replace(/^.*?ERROR:\s*/, ""));
    setText(""); setNote(false); loadThread(); load();
  };
  const assign = async (u: string) => { if (cur) { await sb.rpc("cs_assign", { p_ticket: cur, p_user: u }); load(); } };
  const openPhoto = async (p: string) => { const u = await photoUrl(p, "support"); if (u) window.open(u, "_blank"); };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 330px) minmax(0, 1fr) minmax(220px, 300px)", gap: 12, alignItems: "start" }}>
      <div className="card" style={{ padding: 8, maxHeight: "78vh", overflow: "auto" }}>
        <div className="row" style={{ gap: 4, marginBottom: 6 }}>
          {([["open", "المفتوحة"], ["mine", "بتاعتي"], ["late", "متأخرة"], ["all", "الكل"]] as const).map(([k, l]) => <button key={k} className={filter === k ? "btn pri" : "btn"} style={{ height: 30 }} onClick={() => setFilter(k)}>{l}</button>)}
        </div>
        {list.map((x) => (
          <div key={x.id} onClick={() => setCur(x.id)} style={{ cursor: "pointer", padding: 8, borderRadius: 10, background: x.id === cur ? "#FFF7CF" : undefined, borderInlineStart: late(x) ? "4px solid var(--bad)" : x.last_from === "customer" ? "4px solid var(--y, #F5C800)" : "4px solid transparent" }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>{x.name || x.phone}</b><span className="muted" style={{ fontSize: 12 }}>{ago(x.last_msg_at)}</span></div>
            <div className="muted" style={{ fontSize: 12 }}>#{x.no} · {TOP[x.topic]} · {CH[x.channel]} · {ST[x.status]}{x.assigned_to ? ` · ${AN.get(x.assigned_to) ?? ""}` : ""}</div>
          </div>
        ))}
        {!list.length && <div className="muted" style={{ padding: 10 }}>مفيش تذاكر</div>}
      </div>

      <div className="card" style={{ display: "grid", gap: 8 }}>
        {!t ? <div className="muted">اختار تذكرة</div> : (
          <>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b>تذكرة #{t.no} — {TOP[t.topic]} · {ST[t.status]}{t.rating ? ` · ${"★".repeat(t.rating)}` : ""}</b>
              <select value={t.assigned_to ?? ""} onChange={(e) => assign(e.target.value)} disabled={!manage && !!t.assigned_to && t.assigned_to !== me}>
                <option value="">— مش متوزعة —</option>{agents.filter((a) => manage || a.id === me).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gap: 6, maxHeight: "52vh", overflow: "auto", padding: 4 }}>
              {msgs.map((m) => (
                <div key={m.id} style={{ justifySelf: m.sender === "customer" ? "start" : "end", maxWidth: "80%", background: m.sender === "customer" ? "#FFF3C4" : m.sender === "note" ? "#FDECEC" : m.sender === "bot" ? "#F1F0EA" : "#E6F6EC", borderRadius: 12, padding: "6px 10px" }}>
                  <div className="muted" style={{ fontSize: 11 }}>{m.sender === "customer" ? "العميل" : m.sender === "bot" ? "تلقائي" : m.sender === "note" ? `ملاحظة داخلية — ${AN.get(m.staff_id ?? "") ?? ""}` : AN.get(m.staff_id ?? "") ?? "موظف"} · {ago(m.at)}</div>
                  {m.body && <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>}
                  {m.photo && <button className="btn" style={{ height: 28 }} onClick={() => openPhoto(m.photo!)}>📷 الصورة</button>}
                </div>
              ))}
            </div>
            <div className="row" style={{ gap: 4 }}>{canned.map((c, i) => <button key={i} className="btn" style={{ height: 28, fontSize: 12 }} onClick={() => setText(c)}>{c.slice(0, 28)}{c.length > 28 ? "…" : ""}</button>)}</div>
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={note ? "ملاحظة داخلية (العميل مش هيشوفها)" : "ردك على العميل — هيوصله إشعار"} style={{ background: note ? "#FDECEC" : undefined }} />
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <button className="btn pri" onClick={() => reply()}>ابعت</button>
              <button className="btn" onClick={() => reply("waiting")}>ابعت ومستني العميل</button>
              <button className="btn" onClick={() => reply("solved")}>✅ اتحلّت</button>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" checked={note} onChange={(e) => setNote(e.target.checked)} /> ملاحظة داخلية</label>
              <a className="btn" href={`/cs/new?phone=${t.phone}`}>+ طلب للعميل ده</a>
              {(t.topic === "issue" || t.topic === "refund") && <a className="btn" href="/complaints">الشكاوى والتعويض</a>}
            </div>
            {err && <div className="badmsg">{err}</div>}
          </>
        )}
      </div>

      <div className="card" style={{ display: "grid", gap: 6 }}>
        {!t ? <div className="muted">كارت العميل</div> : (
          <>
            <b>{cust?.name || t.name || "عميل"}</b>
            <div className="row" style={{ gap: 6 }}><span dir="ltr">{t.phone}</span><a className="btn" style={{ height: 28 }} href={`https://wa.me/2${t.phone.replace(/^2/, "")}`} target="_blank" rel="noreferrer">واتساب</a><a className="btn" style={{ height: 28 }} href={`tel:${t.phone}`}>اتصال</a></div>
            {!cust?.found && <div className="muted">مش متسجّل كعميل لسه</div>}
            {cust?.addresses.map((a, i) => <div key={i} className="muted" style={{ fontSize: 12 }}>📍 {[a.district, a.address].filter(Boolean).join(" — ")}</div>)}
            {!!cust?.orders.length && <b style={{ marginTop: 6 }}>آخر الطلبات</b>}
            {cust?.orders.map((o) => (
              <a key={o.no} href={`/t/${o.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, borderTop: "1px solid #eee", paddingTop: 4 }}>
                <b>#{o.no}</b> · {OS[o.status]} · {Math.round(o.total)} ج · {CH[o.channel] ?? ""}
                <div className="muted" style={{ fontSize: 12 }}>{(o.lines ?? []).map((l) => `${l.name} ${l.qty}`).join("، ")}</div>
              </a>
            ))}
            {!!cust?.tickets.length && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>تذاكر قبل كده: {cust.tickets.length}</div>}
          </>
        )}
      </div>
    </div>
  );
}
