"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function ReqRow({ id, qty, status, canEdit, canApprove }: { id: number; qty: number; status: string; canEdit: boolean; canApprove: boolean }) {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [ed, setEd] = useState<"qty" | "cancel" | null>(null);
  const [q, setQ] = useState(String(qty));
  const [why, setWhy] = useState("");
  const [err, setErr] = useState("");
  const go = async (action: string) => {
    setErr("");
    const { error } = await sb.rpc("replenish_set", { p_id: id, p_action: action, p_qty: action === "qty" ? Number(q) : null, p_note: why });
    if (error) return setErr(error.message.replace(/^.*?ERROR:\s*/, ""));
    setEd(null); setWhy(""); router.refresh();
  };
  if (ed) return (
    <div style={{ display: "grid", gap: 4, minWidth: 200 }}>
      {ed === "qty" && <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="decimal" dir="ltr" style={{ width: 90 }} />}
      <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder={ed === "qty" ? "سبب التعديل" : "سبب الإلغاء"} />
      <div className="row" style={{ gap: 4 }}><button className="btn pri" style={{ height: 30 }} onClick={() => go(ed)}>تمام</button><button className="btn" style={{ height: 30 }} onClick={() => setEd(null)}>رجوع</button></div>
      {err && <div className="badmsg">{err}</div>}
    </div>
  );
  return (
    <div className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
      {canApprove && <button className="btn pri" style={{ height: 30 }} onClick={() => go("approve")}>اعتمد</button>}
      {canEdit && status !== "locked" && <button className="btn" style={{ height: 30 }} onClick={() => setEd("qty")}>عدّل</button>}
      {canEdit && <button className="btn" style={{ height: 30 }} onClick={() => setEd("cancel")}>الغي</button>}
      {err && <span className="badmsg">{err}</span>}
    </div>
  );
}
