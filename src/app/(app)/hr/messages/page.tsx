import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../Tabs";
import { sendMessage } from "../actions";

type M = { id: number; title: string; body: string; target: string; location_id: string | null; user_id: string | null; needs_ack: boolean; at: string };

export default async function Messages() {
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: msgs }, { data: reads }, { data: people }, { data: locs }] = await Promise.all([
    sb.from("staff_messages").select("*").order("id", { ascending: false }).limit(50),
    sb.from("staff_message_reads").select("message_id,user_id,ack_at"),
    sb.from("profiles").select("id,name,home_loc").eq("active", true).order("name"),
    sb.from("locations").select("id,name").eq("active", true).order("sort"),
  ]);
  const P = people ?? [];
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const aud = (m: M) => P.filter((p) => m.target === "all" || (m.target === "loc" && p.home_loc === m.location_id) || (m.target === "user" && p.id === m.user_id));
  return (
    <>
      <div className="top"><h1>رسايل الموظفين</h1></div>
      <Tabs cur="/hr/messages" />
      {can(me, "hr.messages") && (
        <form action={sendMessage} className="card" style={{ display: "grid", gap: 8 }}>
          <h2>رسالة جديدة — بتظهر في تطبيق الموظفين</h2>
          <input name="title" placeholder="العنوان" required />
          <textarea name="body" rows={4} placeholder="الرسالة" required />
          <div className="row">
            <label className="fld">لمين<select name="target"><option value="all">الكل</option><option value="loc">موظفين مكان</option><option value="user">شخص</option></select></label>
            <label className="fld">المكان<select name="loc"><option value="">—</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label className="fld">الشخص<select name="user"><option value="">—</option>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="ack" style={{ width: 20, height: 20 }} /> محتاجة "قريت وموافق"</label>
            <button className="btn pri">ابعت</button>
          </div>
        </form>
      )}
      {((msgs ?? []) as M[]).map((m) => {
        const a = aud(m);
        const R = (reads ?? []).filter((r) => Number(r.message_id) === m.id);
        const notRead = a.filter((p) => !R.some((r) => r.user_id === p.id));
        return (
          <div key={m.id} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}><b>{m.title}</b><span className="muted num">{new Date(m.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</span></div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              لـ {m.target === "all" ? "الكل" : m.target === "loc" ? `موظفين ${LN.get(m.location_id ?? "")}` : P.find((p) => p.id === m.user_id)?.name} · قرا {R.length} من {a.length}
              {m.needs_ack ? ` · وافق ${R.filter((r) => r.ack_at).length}` : ""}
              {!!notRead.length && <> · لسه ماقراش: {notRead.map((p) => p.name).join("، ")}</>}
            </div>
          </div>
        );
      })}
    </>
  );
}
