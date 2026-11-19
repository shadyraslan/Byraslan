"use client";
// طلب أونلاين: تعديل الأصناف قبل ما يخرج — مرتجع بعد ما يتسلّم — تعويض في أي وقت
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import CompBox from "./CompBox";

type L = { line: number; item_id: number; name: string; unit: string; qty: number; prepared: number | null; price: number; note?: string | null; gift?: boolean };
type It = { id: number; name: string; unit: string };

export default function OrderFix({ order, status, customerId, lines, shiftClient, onDone }: { order: number; status: string; customerId: number; lines: L[]; shiftClient?: string | null; onDone: (m: string) => void }) {
  const sb = supabaseBrowser();
  const open = ["new", "accepted", "preparing", "ready"].includes(status);
  const [tab, setTab] = useState<string | null>(null);
  const [ed, setEd] = useState(lines.map((l) => ({ item_id: l.item_id, name: l.name, unit: l.unit, qty: String(l.qty), note: l.note ?? "", gift: !!l.gift })));
  const [items, setItems] = useState<It[]>([]);
  const [q, setQ] = useState("");
  const [why, setWhy] = useState("");
  const [ret, setRet] = useState<Record<number, { q: string; f: string }>>({});
  const [method, setMethod] = useState("balance");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (tab === "edit" && !items.length) sb.from("items").select("id,name,unit").eq("active", true).order("name").then(({ data }) => setItems((data ?? []) as It[])); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const err = (e: { message: string }) => setMsg({ ok: false, t: e.message.replace(/^.*?ERROR:\s*/, "") });
  const saveEdit = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await sb.rpc("order_edit", { p_id: order, p_lines: ed.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) || 0, note: l.note, gift: l.gift })), p_reason: why });
    setBusy(false); if (error) return err(error);
    const t = `اتعدّل الطلب — الإجمالي التقريبي ${(data as { est: number }).est} ج`; setMsg({ ok: true, t }); setWhy(""); onDone(t);
  };
  const doReturn = async () => {
    setBusy(true); setMsg(null);
    const ls = lines.filter((l) => Number(ret[l.line]?.q) > 0).map((l) => ({ line: l.line, qty: Number(ret[l.line].q), fate: ret[l.line].f || "stock" }));
    const { data, error } = await sb.rpc("order_return", { p_id: order, p_lines: ls, p_reason: why, p_method: method, p_shift_client: shiftClient ?? null });
    setBusy(false); if (error) return err(error);
    const d = data as { total: number; balance: number };
    const t = `اتسجّل المرتجع ${d.total} ج — ${method === "balance" ? `رصيد العميل بقى ${d.balance} ج` : method === "cash" ? "طلّعهم من الدرج للعميل" : method === "credit" ? "اتخصموا من حسابه الآجل" : "حوّلهم للعميل"}`;
    setMsg({ ok: true, t }); setWhy(""); setRet({}); onDone(t);
  };
  const found = q.trim() ? items.filter((i) => i.name.includes(q.trim())).slice(0, 8) : [];
  return (
    <div className="card" style={{ display: "grid", gap: 8 }}>
      <div className="row" style={{ gap: 6 }}>
        {open && <button className={tab === "edit" ? "btn pri" : "btn"} onClick={() => setTab(tab === "edit" ? null : "edit")}>✏️ عدّل الأصناف</button>}
        {status === "delivered" && <button className={tab === "return" ? "btn pri" : "btn"} onClick={() => setTab(tab === "return" ? null : "return")}>↩️ مرتجع</button>}
        <button className={tab === "comp" ? "btn pri" : "btn"} onClick={() => setTab(tab === "comp" ? null : "comp")}>🎁 تعويض</button>
      </div>
      {tab === "edit" && (
        <div style={{ display: "grid", gap: 6 }}>
          {ed.map((l, i) => (
            <div key={i} className="row" style={{ gap: 6 }}>
              <b style={{ minWidth: 120 }}>{l.name}{l.gift ? " 🎁" : ""}</b>
              <input value={l.qty} onChange={(e) => setEd(ed.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} inputMode="decimal" dir="ltr" style={{ width: 80 }} />
              <span className="muted">{l.unit}</span>
              <input value={l.note} onChange={(e) => setEd(ed.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="تعليمات" style={{ flex: 1 }} />
              <button className="btn" style={{ height: 32 }} onClick={() => setEd(ed.filter((_, j) => j !== i))}>احذف</button>
            </div>
          ))}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="+ ضيف صنف…" />
          {found.map((i) => <button key={i.id} className="btn" style={{ height: 32, justifySelf: "start" }} onClick={() => { setEd([...ed, { item_id: i.id, name: i.name, unit: i.unit, qty: "1", note: "", gift: false }]); setQ(""); }}>+ {i.name}</button>)}
          <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="سبب التعديل (إجباري)" />
          <button className="btn pri" disabled={busy || why.trim().length < 3 || !ed.length} onClick={saveEdit} style={{ justifySelf: "start" }}>احفظ التعديل</button>
          <div className="muted" style={{ fontSize: 12 }}>السطر اللي اتغيّرت كميته أو اتحذف بتتشال علبه المتجهزة وترجع للمخزون. محتاج صلاحية «تعديل أصناف طلب».</div>
        </div>
      )}
      {tab === "return" && (
        <div style={{ display: "grid", gap: 6 }}>
          {lines.map((l) => (
            <div key={l.line} className="row" style={{ gap: 6 }}>
              <b style={{ minWidth: 120 }}>{l.name}</b><span className="muted">اتسلّم {l.prepared ?? l.qty} {l.unit}</span>
              <input value={ret[l.line]?.q ?? ""} onChange={(e) => setRet({ ...ret, [l.line]: { q: e.target.value, f: ret[l.line]?.f ?? "stock" } })} placeholder="راجع كام" inputMode="decimal" dir="ltr" style={{ width: 90 }} />
              <select value={ret[l.line]?.f ?? "stock"} onChange={(e) => setRet({ ...ret, [l.line]: { q: ret[l.line]?.q ?? "", f: e.target.value } })} style={{ height: 34 }}>
                <option value="stock">يرجع المخزن</option><option value="waste">هالك</option><option value="donate">تبرعات</option>
              </select>
              <button className="btn" style={{ height: 32 }} onClick={() => setRet({ ...ret, [l.line]: { q: String(l.prepared ?? l.qty), f: ret[l.line]?.f ?? "stock" } })}>كله</button>
            </div>
          ))}
          <div className="row">
            <label className="fld">الفلوس ترجع إزاي<select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="balance">رصيد على حسابه</option>{shiftClient && <option value="cash">كاش من الدرج</option>}<option value="instapay">إنستاباي</option><option value="wallet">محفظة</option><option value="credit">من حسابه الآجل</option>
            </select></label>
            <label className="fld" style={{ flex: 1 }}>السبب<input value={why} onChange={(e) => setWhy(e.target.value)} /></label>
          </div>
          <button className="btn pri" disabled={busy || why.trim().length < 3} onClick={doReturn} style={{ justifySelf: "start" }}>سجّل المرتجع</button>
        </div>
      )}
      {tab === "comp" && <CompBox orderId={order} customerId={customerId} shiftClient={shiftClient} openOrderId={open ? order : null} onDone={onDone} />}
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}
