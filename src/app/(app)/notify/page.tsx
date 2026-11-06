import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import SendForm from "./SendForm";
import { saveWelcome } from "./actions";

type W = { on?: boolean; ver?: number; title?: string; body?: string };

export default async function Notify() {
  const me = await getMe();
  if (!can(me, "notify.send") && !can(me, "hr.messages")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: ds }, { data: locs }, { data: people }, { data: notices }, { data: devs }, { data: S }] = await Promise.all([
    sb.from("districts").select("id,name").eq("active", true).order("sort"),
    sb.from("locations").select("id,name").eq("active", true).order("sort"),
    sb.from("profiles").select("id,name").eq("active", true).order("name"),
    sb.from("app_notices").select("id,title,body,target,at,pushed").order("id", { ascending: false }).limit(30),
    sb.from("push_devices").select("app"),
    sb.from("settings").select("key,value").in("key", ["app.welcome", "hr.welcome"]),
  ]);
  const w = (k: string) => ((S ?? []).find((s) => s.key === k)?.value ?? {}) as W;
  const nDev = (a: string) => (devs ?? []).filter((d) => d.app === a).length;
  const TG: Record<string, string> = { all: "الكل", district: "منطقة", branch: "فرع", phone: "عميل" };
  const Wel = ({ k, label }: { k: string; label: string }) => {
    const x = w(k);
    return (
      <form action={saveWelcome} className="card" style={{ display: "grid", gap: 8 }}>
        <h2>رسالة الترحيب — {label} <span className="muted" style={{ fontSize: 12 }}>نسخة {x.ver ?? 0}</span></h2>
        <input type="hidden" name="key" value={k} />
        <label className="row" style={{ gap: 6 }}><input type="checkbox" name="on" defaultChecked={x.on !== false} style={{ width: 20, height: 20 }} /> بتظهر أول ما الشخص يفتح التطبيق</label>
        <input name="title" defaultValue={x.title ?? ""} placeholder="العنوان" />
        <textarea name="body" rows={3} defaultValue={x.body ?? ""} placeholder="الرسالة" />
        <div className="muted" style={{ fontSize: 12.5 }}>لو غيّرت النص، هتظهر تاني لكل الناس مرة واحدة.</div>
        <button className="btn pri">حفظ</button>
      </form>
    );
  };
  return (
    <>
      <div className="top"><h1>الإشعارات والرسايل</h1></div>
      <div className="kpis">
        <div className="kpi"><span>موبايلات العملاء المسجّلة للإشعارات</span><b className="num">{nDev("customer")}</b></div>
        <div className="kpi"><span>موبايلات الموظفين</span><b className="num">{nDev("staff")}</b></div>
      </div>
      {nDev("customer") + nDev("staff") === 0 && <div className="card muted" style={{ fontSize: 13.5 }}>الرسايل بتوصل صندوق الإشعارات جوه التطبيقين من دلوقتي. الإشعار اللي بيوصل الموبايل والتطبيق مقفول هيشتغل بعد ما التطبيقات تتبني بحساب Expo وFirebase.</div>}
      <SendForm districts={(ds ?? []).map((d) => ({ id: d.id as number, name: d.name as string }))} locs={(locs ?? []).map((d) => ({ id: d.id as string, name: d.name as string }))} people={(people ?? []).map((d) => ({ id: d.id as string, name: d.name as string }))} />
      <div className="grid2">
        <Wel k="app.welcome" label="تطبيق العملاء" />
        <Wel k="hr.welcome" label="تطبيق الموظفين" />
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>اللي اتبعت لتطبيق العملاء</h2>
        <table><thead><tr><th>العنوان</th><th>لمين</th><th>وصلت موبايلات</th><th>الوقت</th></tr></thead>
          <tbody>{(notices ?? []).map((n) => <tr key={n.id}><td style={{ whiteSpace: "normal" }}><b>{n.title}</b><div className="muted" style={{ fontSize: 12.5 }}>{n.body}</div></td><td>{TG[n.target]}</td><td className="num">{n.pushed}</td><td className="num">{new Date(n.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td></tr>)}
            {!notices?.length && <tr><td colSpan={4} className="muted">لسه مفيش</td></tr>}</tbody></table>
        <div className="muted" style={{ fontSize: 13 }}>رسايل الموظفين ومين قراها في <Link href="/hr/messages"><b>رسايل الموظفين</b></Link>.</div>
      </div>
    </>
  );
}
