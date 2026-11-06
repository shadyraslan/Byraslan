import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../../Tabs";
import { savePay } from "../../pay-actions";

const DAYS = ["الحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];
type P = { user_id: string; pay_type: string; base: number; allowances: number; insurance_wage: number; shift_start: string; rest_day: number; hire_date: string; custody_max: number | null };

export default async function PaySetup({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.pay")) redirect("/hr/payroll");
  const sb = await supabaseServer();
  const [{ data: people }, { data: pays }] = await Promise.all([
    sb.from("profiles").select("id,name,job,is_test").eq("active", true).order("name"),
    sb.from("employee_pay").select("*"),
  ]);
  const PM = new Map(((pays ?? []) as P[]).map((p) => [p.user_id, p]));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="top"><h1>بيانات القبض</h1></div>
      <Tabs cur="/hr/payroll" />
      <Flash sp={sp} />
      <div className="card muted">المرتب بيتحسب من البيانات دي + الحضور + اللايحة. اليومية: اكتب سعر اليوم مكان المرتب. ميعاد بداية الوردية هو اللي التأخير بيتحسب منه.</div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>النظام</th><th>المرتب / اليومية</th><th>البدلات</th><th>أجر التأمينات</th><th>بداية الوردية</th><th>الراحة</th><th>التعيين</th><th>أقصى عهدة</th><th></th></tr></thead>
          <tbody>{(people ?? []).filter((p) => !p.is_test).map((p) => {
            const x = PM.get(p.id);
            const fid = `f-${p.id}`;
            return (
              <tr key={p.id}>
                <td><b>{p.name}</b><div className="muted" style={{ fontSize: 12 }}>{p.job}</div><form id={fid} action={savePay}><input type="hidden" name="user" value={p.id} /></form></td>
                <td><select form={fid} name="pay_type" defaultValue={x?.pay_type ?? "monthly"}><option value="monthly">شهري</option><option value="daily">يومية</option></select></td>
                <td><input form={fid} name="base" defaultValue={x?.base ?? ""} inputMode="decimal" dir="ltr" style={{ width: 90 }} /></td>
                <td><input form={fid} name="allowances" defaultValue={x?.allowances ?? 0} inputMode="decimal" dir="ltr" style={{ width: 80 }} /></td>
                <td><input form={fid} name="ins" defaultValue={x?.insurance_wage ?? 0} inputMode="decimal" dir="ltr" style={{ width: 80 }} /></td>
                <td><input form={fid} name="shift" type="time" defaultValue={(x?.shift_start ?? "09:00").slice(0, 5)} /></td>
                <td><select form={fid} name="rest" defaultValue={x?.rest_day ?? 5}>{DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}</select></td>
                <td><input form={fid} name="hire" type="date" defaultValue={x?.hire_date ?? today} /></td>
                <td><input form={fid} name="cmax" defaultValue={x?.custody_max ?? ""} placeholder="مفتوح" inputMode="decimal" dir="ltr" style={{ width: 80 }} /></td>
                <td><button form={fid} className="btn pri" style={{ height: 34 }}>حفظ</button></td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </>
  );
}
