import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { cairoDate } from "@/lib/time";
import Tabs from "../Tabs";
import NewExpense from "./NewExpense";
import { decideExpense, addCategory } from "../actions";
import Receipt from "./Photo";

const FROM: Record<string, string> = { cash: "كاش", shift: "درج الوردية", bank: "بنك" };
const ST: Record<string, [string, string]> = { ok: ["", ""], pending: ["مستني موافقة", "#b7791f"], rejected: ["مرفوض", "var(--bad)"] };

export default async function Expenses({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const me = await getMe();
  const m = (await searchParams).m || cairoDate().slice(0, 7);
  const sb = await supabaseServer();
  const end = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1).toISOString().slice(0, 10);
  const [{ data: rows }, { data: locs }, { data: cats }, { data: people }] = await Promise.all([
    sb.from("expenses").select("id,no,day,location_id,category_id,amount,paid_from,note,photo,status,by,decision_note").gte("day", `${m}-01`).lt("day", end).order("id", { ascending: false }),
    sb.from("locations").select("id,name").order("name"),
    sb.from("expense_categories").select("id,name").eq("active", true).order("id"),
    sb.from("profiles").select("id,name"),
  ]);
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const CN = new Map((cats ?? []).map((c) => [Number(c.id), c.name as string]));
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const R = rows ?? [];
  const ok = R.filter((r) => r.status === "ok");
  const byCat = [...new Set(ok.map((r) => Number(r.category_id)))].map((c) => ({ c, t: ok.filter((r) => Number(r.category_id) === c).reduce((a, r) => a + Number(r.amount), 0) })).sort((a, b) => b.t - a.t);
  const total = byCat.reduce((a, x) => a + x.t, 0);
  return (
    <>
      <div className="top"><h1>المصروفات</h1></div>
      <Tabs cur="/accounts/expenses" />
      {can(me, "acc.post") && <NewExpense locs={(locs ?? []).map((l) => ({ id: l.id as string, name: l.name as string }))} cats={(cats ?? []).map((c) => ({ id: Number(c.id), name: c.name as string }))} home={me?.home ?? null} />}
      <form className="card row">
        <label className="fld">الشهر<input type="month" name="m" defaultValue={m} /></label><button className="btn">اعرض</button>
        <b className="num" style={{ marginInlineStart: "auto" }}>إجمالي الشهر {Math.round(total).toLocaleString("en-US")} ج</b>
      </form>
      {byCat.length > 0 && <div className="card">
        {byCat.map((x) => <div key={x.c} className="row" style={{ gap: 8 }}><span style={{ width: 160 }}>{CN.get(x.c)}</span>
          <div style={{ flex: 1, height: 10, background: "var(--line)", borderRadius: 6 }}><div style={{ width: `${(x.t / total) * 100}%`, height: "100%", background: "var(--y)", borderRadius: 6 }} /></div>
          <b className="num" style={{ width: 90 }}>{Math.round(x.t).toLocaleString("en-US")}</b></div>)}
      </div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>#</th><th>اليوم</th><th>المكان</th><th>البند</th><th>المبلغ</th><th>من</th><th>تفاصيل</th><th></th></tr></thead>
          <tbody>
            {R.map((r) => (
              <tr key={r.id} style={r.status === "rejected" ? { opacity: 0.5 } : undefined}>
                <td className="num">{r.no}</td><td className="num">{r.day}</td><td>{LN.get(r.location_id)}</td><td>{CN.get(Number(r.category_id))}</td>
                <td className="num"><b>{Number(r.amount).toLocaleString("en-US")}</b></td><td>{FROM[r.paid_from]}</td>
                <td style={{ whiteSpace: "normal", fontSize: 13 }}>{r.note} <span className="muted">— {PN.get(r.by)}</span>{r.status !== "ok" && <div style={{ color: ST[r.status][1] }}>{ST[r.status][0]}{r.decision_note ? `: ${r.decision_note}` : ""}</div>}</td>
                <td>
                  {r.photo && <Receipt path={r.photo} />}
                  {r.status === "pending" && can(me, "acc.approve") && <form action={decideExpense} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <input type="hidden" name="id" value={r.id} /><input name="note" placeholder="ملاحظة" style={{ width: 110, height: 32 }} />
                    <button name="approve" value="1" className="btn pri" style={{ height: 32 }}>وافق</button><button name="approve" value="0" className="btn" style={{ height: 32 }}>ارفض</button></form>}
                </td>
              </tr>
            ))}
            {!R.length && <tr><td colSpan={8} className="muted">مفيش مصروفات في الشهر ده</td></tr>}
          </tbody>
        </table>
      </div>
      {can(me, "acc.approve") && <form action={addCategory} className="card row"><input name="name" placeholder="بند مصروف جديد" /><button className="btn">+ بند</button></form>}
    </>
  );
}
