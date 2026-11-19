"use client";
// تسوية رصيد عميل: العميل يسدّد اللي عليه (كاش في الوردية / تحويل) — أو نرجّعله رصيده
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SettleBox({ customerId, balance, shiftClient, onDone }: { customerId: number; balance: number; shiftClient?: string | null; onDone?: (balance: number, msg: string) => void }) {
  const sb = supabaseBrowser();
  const owes = balance < 0;
  const [dir, setDir] = useState<"in" | "out">(owes ? "in" : "out");
  const [amt, setAmt] = useState(String(Math.abs(balance) || ""));
  const [method, setMethod] = useState(shiftClient ? "cash" : "instapay");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const go = async () => {
    setBusy(true); setMsg(null);
    const a = Math.abs(Number(amt) || 0) * (dir === "in" ? 1 : -1);
    const { data, error } = await sb.rpc("cust_settle", { p_cust: customerId, p_amount: a, p_method: method, p_shift_client: method === "cash" ? shiftClient ?? null : null, p_note: note });
    setBusy(false);
    if (error) return setMsg({ ok: false, t: error.message.replace(/^.*?ERROR:\s*/, "") });
    const b = Number((data as { balance: number }).balance);
    const t = `${dir === "in" ? "اتسجّل إن العميل دفع" : "اتسجّل إننا رجّعنا للعميل"} ${Math.abs(a)} ج — ${b === 0 ? "حسابه بقى صفر ✓" : b > 0 ? `ليه ${b} ج` : `لسه عليه ${-b} ج`}`;
    setMsg({ ok: true, t }); setNote(""); onDone?.(b, t);
  };
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        <button className={dir === "in" ? "btn pri" : "btn"} style={{ height: 34 }} onClick={() => setDir("in")}>العميل دفع لنا</button>
        <button className={dir === "out" ? "btn pri" : "btn"} style={{ height: 34 }} onClick={() => setDir("out")} disabled={balance <= 0}>رجّعنا له رصيده</button>
      </div>
      <div className="row" style={{ gap: 6 }}>
        <input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 100 }} placeholder="المبلغ" />
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={{ height: 40 }}>
          {shiftClient && <option value="cash">كاش (درج الوردية)</option>}
          <option value="instapay">إنستاباي</option><option value="wallet">محفظة</option><option value="transfer">تحويل بنكي</option><option value="card">فيزا</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة (رقم التحويل…)" style={{ flex: 1, minWidth: 120 }} />
      </div>
      <button className="btn pri" disabled={busy || !(Number(amt) > 0)} onClick={go} style={{ justifySelf: "start" }}>سجّل التسوية</button>
      {msg && <div className={msg.ok ? "okmsg" : "badmsg"}>{msg.t}</div>}
    </div>
  );
}
