import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import { publishPolicy } from "../pay-actions";

/** نص اللايحة: أي نشر جديد بيطلب من كل موظف يقراها ويوافق تاني من التطبيق */
export default async function Policy({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.view") && !can(me, "settings.edit")) redirect("/hr");
  const sb = await supabaseServer();
  const [{ data: pol }, { data: people }] = await Promise.all([
    sb.from("settings").select("value").eq("key", "hr.policy").maybeSingle(),
    sb.from("profiles").select("id,name,policy_ver,is_test").eq("active", true).order("name"),
  ]);
  const p = (pol?.value ?? { ver: 0, text: "" }) as { ver: number; text: string };
  const staff = (people ?? []).filter((x) => !x.is_test);
  const notYet = staff.filter((x) => Number(x.policy_ver) < p.ver);
  return (
    <>
      <div className="top"><h1>لايحة الشغل</h1></div>
      <Tabs cur="/hr/policy" />
      <Flash sp={sp} />
      <div className="kpis">
        <div className="kpi"><span>النسخة</span><b className="num">{p.ver}</b></div>
        <div className="kpi"><span>وافقوا عليها</span><b className="num">{staff.length - notYet.length}</b></div>
        <div className="kpi"><span>لسه</span><b className="num" style={{ color: notYet.length ? "var(--bad)" : undefined }}>{notYet.length}</b></div>
      </div>
      {!!notYet.length && <div className="card muted">لسه ماوافقوش: {notYet.map((x) => x.name).join("، ")}</div>}
      {can(me, "settings.edit") ? (
        <form action={publishPolicy} className="card">
          <label className="fld" style={{ display: "grid" }}>نص اللايحة
            <textarea name="text" rows={22} defaultValue={p.text} style={{ lineHeight: 1.9 }} />
          </label>
          <button className="btn pri" style={{ marginTop: 8 }}>انشر نسخة جديدة</button>
          <div className="muted" style={{ marginTop: 6 }}>بعد النشر كل موظف بيوصله إشعار، والتطبيق بيقفل عليه لحد ما يقرا النسخة الجديدة ويوافق. الأرقام (الخصومات والسماح والإجازات) بتتعدّل من "اللايحة والأرصدة" مش من النص.</div>
        </form>
      ) : <div className="card" style={{ whiteSpace: "pre-wrap" }}>{p.text}</div>}
    </>
  );
}
