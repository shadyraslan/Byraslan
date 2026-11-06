import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import { addDay, cancelDay } from "../pay-actions";

const K: Record<string, string> = { holiday: "إجازة رسمية", gift: "إجازة مدفوعة (هدية)", from_balance: "من رصيد الإجازات", substitute: "بديل إجازة رسمية" };
type D = { id: number; day: string; kind: string; name: string; scope: string; locs: string[]; users: string[]; for_day: string | null; cancelled: boolean };

export default async function Days({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.days") && !can(me, "hr.view")) redirect("/hr");
  const sb = await supabaseServer();
  const y = new Date().getFullYear();
  const [{ data }, { data: locs }, { data: people }] = await Promise.all([
    sb.from("company_days").select("*").eq("cancelled", false).gte("day", `${y}-01-01`).order("day"),
    sb.from("locations").select("id,name,parent").eq("active", true).order("sort"),
    sb.from("profiles").select("id,name,is_test").eq("active", true).order("name"),
  ]);
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const holidays = ((data ?? []) as D[]).filter((d) => d.kind === "holiday");
  const who = (d: D) => d.scope === "all" ? "كل الشركة" : d.scope === "loc" ? d.locs.map((l) => LN.get(l) ?? l).join("، ") : d.users.map((u) => PN.get(u) ?? "").join("، ");
  const edit = can(me, "hr.days");
  return (
    <>
      <div className="top"><h1>أيام الإجازة والإجازات الرسمية</h1></div>
      <Tabs cur="/hr/days" />
      <Flash sp={sp} />
      {edit && (
        <form action={addDay} className="card">
          <h2>+ يوم إجازة</h2>
          <div className="row" style={{ alignItems: "end" }}>
            <label className="fld">النوع<select name="kind">{Object.entries(K).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="fld">الاسم / السبب<input name="name" placeholder="صيانة المصنع، عيد الفطر…" required /></label>
            <label className="fld">من<input type="date" name="day" required /></label>
            <label className="fld">لحد (اختياري)<input type="date" name="to" /></label>
            <label className="fld">بديل الإجازة الرسمية بتاعة<select name="for_day"><option value="">— للبديل بس —</option>{holidays.map((h) => <option key={h.id} value={h.day}>{h.day} {h.name}</option>)}</select></label>
          </div>
          <div style={{ marginTop: 10 }}>
            <b>لمين؟</b>
            <div className="row" style={{ gap: 16, margin: "6px 0" }}>
              <label className="row" style={{ gap: 6 }}><input type="radio" name="scope" value="all" defaultChecked /> كل الشركة</label>
              <label className="row" style={{ gap: 6 }}><input type="radio" name="scope" value="loc" /> مواقع / أقسام</label>
              <label className="row" style={{ gap: 6 }}><input type="radio" name="scope" value="users" /> أفراد</label>
            </div>
            <details><summary>اختار المواقع والأقسام (الموقع بيشمل الأقسام اللي تحته)</summary>
              <div className="row" style={{ gap: 10, marginTop: 6 }}>{(locs ?? []).map((l) => <label key={l.id} className="row" style={{ gap: 4 }}><input type="checkbox" name="locs" value={l.id} />{l.parent ? "↳ " : ""}{l.name}</label>)}</div>
            </details>
            <details><summary>اختار الأفراد</summary>
              <div className="row" style={{ gap: 10, marginTop: 6 }}>{(people ?? []).filter((p) => !p.is_test).map((p) => <label key={p.id} className="row" style={{ gap: 4 }}><input type="checkbox" name="users" value={p.id} />{p.name}</label>)}</div>
            </details>
          </div>
          <button className="btn pri" style={{ marginTop: 10 }}>سجّل</button>
          <div className="muted" style={{ marginTop: 6 }}>
            الهدية بتتدفع ومش من الرصيد · "من الرصيد" بتتخصم من السنوية · البديل: اليوم ده إجازة مدفوعة واللي اشتغل الإجازة الرسمية دي مايتصرفلوش يوم زيادة.
            الأعياد الإسلامية وشم النسيم ضيفها هنا لما تتعلن.
          </div>
        </form>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>أيام {y} وبعدها</h2>
        <table><tbody>{((data ?? []) as D[]).map((d) => (
          <tr key={d.id}>
            <td className="num"><b>{d.day}</b></td><td>{d.name}</td><td>{K[d.kind]}{d.for_day ? ` (بدل ${d.for_day})` : ""}</td><td style={{ whiteSpace: "normal" }}>{who(d)}</td>
            <td>{edit && <form action={cancelDay}><input type="hidden" name="id" value={d.id} /><button className="btn" style={{ height: 30 }}>إلغاء</button></form>}</td>
          </tr>
        ))}</tbody></table>
      </div>
    </>
  );
}
