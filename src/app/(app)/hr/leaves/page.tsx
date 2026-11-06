import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../Tabs";
import { decideLeave } from "../actions";

const K: Record<string, string> = { annual: "سنوية", casual: "عارضة", sick: "مرضي", unpaid: "بدون مرتب", advance: "سلفة" };
const S: Record<string, string> = { pending: "مستني", approved: "اتوافق", rejected: "اترفض", cancelled: "اتلغى" };
type R = { id: number; user_id: string; kind: string; from_date: string | null; to_date: string | null; amount: number | null; note: string | null; status: string; at: string; decision_note: string | null };

export default async function Leaves() {
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data }, { data: people }] = await Promise.all([
    sb.from("leave_requests").select("*").order("id", { ascending: false }).limit(150),
    sb.from("profiles").select("id,name"),
  ]);
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const R = (data ?? []) as R[];
  const can2 = can(me, "hr.leaves");
  const Row = ({ r }: { r: R }) => (
    <tr>
      <td><b>{PN.get(r.user_id)}</b></td><td>{K[r.kind]}{r.amount ? <b className="num"> {r.amount} ج</b> : null}</td>
      <td className="num">{r.from_date ? `${r.from_date} ← ${r.to_date}` : "—"}</td>
      <td style={{ whiteSpace: "normal" }}>{r.note}{r.decision_note ? <div className="muted">الرد: {r.decision_note}</div> : null}</td>
      <td>{r.status === "pending" && can2 ? (
        <form action={decideLeave} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <input type="hidden" name="id" value={r.id} /><input name="note" placeholder="رد" style={{ width: 110, height: 32 }} />
          <button name="ok" value="1" className="btn pri" style={{ height: 32 }}>وافق</button><button name="ok" value="0" className="btn" style={{ height: 32 }}>ارفض</button>
        </form>) : S[r.status]}</td>
    </tr>
  );
  return (
    <>
      <div className="top"><h1>الإجازات والسلف</h1></div>
      <Tabs cur="/hr/leaves" />
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>مستنية رد ({R.filter((r) => r.status === "pending").length})</h2>
        <table><thead><tr><th>الموظف</th><th>النوع</th><th>المدة</th><th>السبب</th><th></th></tr></thead>
          <tbody>{R.filter((r) => r.status === "pending").map((r) => <Row key={r.id} r={r} />)}</tbody></table>
        {!can2 && <div className="muted">الموافقة محتاجة صلاحية "الإجازات والسلف" — والسلف بحد مبلغ.</div>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>السجل</h2>
        <table><thead><tr><th>الموظف</th><th>النوع</th><th>المدة</th><th>السبب</th><th>الحالة</th></tr></thead>
          <tbody>{R.filter((r) => r.status !== "pending").map((r) => <Row key={r.id} r={r} />)}</tbody></table>
      </div>
    </>
  );
}
