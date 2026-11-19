"use client";
// تعويض العميل: فلوس (رصيد / كاش من الوردية / إنستاباي / محفظة) — أصناف ببلاش بأوزان جديدة — هدية. على فاتورة كاشير أو طلب أونلاين
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type It = { id: number; name: string; unit: string };
const K: [string, string][] = [["money", "💵 فلوس"], ["items", "🔁 أصناف بوزن جديد"], ["gift", "🎁 هدية"]];

export default function CompBox({ saleId, orderId, customerId, shiftClient, openOrderId, onDone }: { saleId?: number; orderId?: number; customerId?: number; shiftClient?: string | null; openOrderId?: number | null; onDone?: (msg: string) => void }) {
  const sb = supabaseBrowser();
  const [kind, setKind] = useState("money");
  const [amt, setAmt] = useState("");
  const [method, setMethod] = useState("balance");
  const [why, setWhy] = useState("");
  const [items, setItems] = useState<It[]>([]);
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<{ item_id: number; name: string; unit: string; qty: string; note: string }[]>([]);
  const [onOpen, setOnOpen] = useState(!!openOrderId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  useEffect(() => { if (kind !== "money" && !items.length) sb.from("items").select("id,name,unit").eq("active", true).order("name").then(({ data }) => setItems((data ?? []) as It[])); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await sb.rpc("comp_create", {
      p_kind: kind, p_customer: customerId ?? null, p_sale: saleId ?? null, p_order: orderId ?? null,
      p_amount: kind === "money" ? Number(amt) || 0 : null, p_method: kind === "money" ? method : null,
      p_lines: kind === "money" ? null : lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) || 0, note: l.note })),
      p_target_order: kind !== "money" && onOpen ? openOrderId ?? null : null, p_reason: why, p_complaint: null, p_shift_client: shiftClient ?? null,
    });
    setBusy(false);
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    const d = data as { value: number; order?: number; balance?: number };
    const t = kind === "money" ? `اتسجّل تعويض ${d.value} ج${method === "balance" ? ` — رصيد العميل بقى ${d.balance} ج` : method === "cash" ? " — طلّعهم من الدرج للعميل" : " — حوّلهم للعميل"}` : d.order ? `اتعمل طلب ${kind === "gift" ? "هدية" : "تعويض"} #${d.order} ببلاش (قيمته ${d.value} ج) — هيتجهز ويتوصّل عادي` : `اتضاف على الطلب ببلاش (قيمته ${d.value} ج)`;
    setMsg({ ok: true, t }); setAmt(""); setWhy(""); setLines([]); onDone?.(t);
  };
  const found = q.trim() ? items.filter((i) => i.name.includes(q.trim())).slice(0, 8) : [];
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>{K.map(([k, l]) => <button key={k} className={kind === k ? "btn pri" : "btn"} style={{ height: 34 }} onClick={() => setKind(k)}>{l}</button>)}</div>
      {kind === "money" ? (
        <div className="row">
          <label className="fld">المبلغ<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 100 }} /></label>
          <label className="fld">يوصل للعميل إزاي<select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="balance">رصيد على حسابه (يتخصم من الجاي)</option>
            {shiftClient && <option value="cash">كاش من الدرج دلوقتي</option>}
            <option value="instapay">إنستاباي</option><option value="wallet">محفظة</option>
          </select></label>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر على الصنف…" />
          {found.map((i) => <button key={i.id} className="btn" style={{ height: 32, justifySelf: "start" }} onClick={() => { setLines([...lines, { item_id: i.id, name: i.name, unit: i.unit, qty: "1", note: "" }]); setQ(""); }}>+ {i.name}</button>)}
          {lines.map((l, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <b style={{ minWidth: 120 }}>{l.name}</b>
              <input value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" dir="ltr" style={{ width: 80 }} />
              <span className="muted">{l.unit}</span>
              <input value={l.note} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="ملاحظة (تقطيع…)" style={{ flex: 1 }} />
              <button className="btn" style={{ height: 32 }} onClick={() => setLines(lines.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          {openOrderId ? <label className="row" style={{ gap: 6 }}><input type="checkbox" checked={onOpen} onChange={(e) => setOnOpen(e.target.checked)} /> ضيفها ببلاش على الطلب ده (لسه ماخرجش) — من غير طلب جديد</label>
            : <div className="muted" style={{ fontSize: 12.5 }}>هيتعمل طلب جديد ببلاش على عنوان العميل، يتجهز ويتوصّل عادي.</div>}
        </div>
      )}
      <label className="fld">السبب (إجباري)<input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="مثلاً: الوزن ناقص، تأخير، صنف بايظ" /></label>
      <button className="btn pri" disabled={busy || why.trim().length < 3 || (kind === "money" ? !(Number(amt) > 0) : !lines.length)} onClick={go} style={{ justifySelf: "start" }}>سجّل التعويض</button>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
      <div className="muted" style={{ fontSize: 12 }}>كل نوع تعويض بصلاحية بحد أقصى، وبيتسجّل مين عمله وليه.</div>
    </div>
  );
}
