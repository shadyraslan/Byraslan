import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { excusePresence, savePresenceCfg } from "../more-actions";

type C = { id: number; user_id: string; sent_at: string; due_at: string; done_at: string | null; distance_m: number | null; status: string };
const ST: Record<string, string> = { pending: "مستني", ok: "✅ موجود", far: "⚠️ بعيد", missed: "❌ فايت", excused: "اتعذر" };
const t = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });

/** تأكيد التواجد العشوائي: إشعار في وقت عشوائي أثناء الوردية ← الموظف يدوس "أنا موجود" بالموقع ← الفايت بيتخصم ساعات */
export default async function Presence({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; d?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!me) redirect("/login");
  const sb = await supabaseServer();
  const d = sp.d ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const [{ data }, { data: people }, { data: cfg }] = await Promise.all([
    sb.from("presence_checks").select("*").gte("sent_at", `${d}T00:00:00+02:00`).lt("sent_at", `${d}T23:59:59+02:00`).order("id", { ascending: false }),
    sb.from("profiles").select("id,name").order("name"),
    sb.from("settings").select("value").eq("key", "hr.presence").maybeSingle(),
  ]);
  const PN = new Map((people ?? []).map((p) => [p.id, p.name]));
  const L = (data ?? []) as C[];
  const c = (cfg?.value ?? {}) as { on?: boolean; per_day?: number; window_min?: number; deduct_hours?: number; max_m?: number };
  return (
    <>
      <div className="top"><h1>تأكيد التواجد</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      {!c.on && <div className="note">تأكيد التواجد مقفول دلوقتي — شغّله من تحت.</div>}
      <form className="card row" style={{ alignItems: "end" }}><label className="fld">اليوم<input type="date" name="d" defaultValue={d} /></label><button className="btn">اعرض</button></form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>اتبعت</th><th>ردّ</th><th>البعد</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {L.map((x) => (
              <tr key={x.id}>
                <td><b>{PN.get(x.user_id)}</b></td><td>{t(x.sent_at)}</td><td>{x.done_at ? t(x.done_at) : "—"}</td><td className="num">{x.distance_m != null ? `${x.distance_m} م` : ""}</td><td>{ST[x.status]}</td>
                <td>{(x.status === "missed" || x.status === "far") && (can(me, "hr.attendance") || can(me, "hr.shifts")) && <form action={excusePresence}><input type="hidden" name="id" value={x.id} /><button className="btn">اعذره</button></form>}</td>
              </tr>
            ))}
            {!L.length && <tr><td colSpan={6} className="muted">مفيش تأكيدات في اليوم ده</td></tr>}
          </tbody>
        </table>
      </div>
      {can(me, "settings.edit") && (
        <form action={savePresenceCfg} className="card row" style={{ alignItems: "end" }}>
          <label><input type="checkbox" name="on" defaultChecked={!!c.on} /> شغّال</label>
          <label className="fld">عدد التأكيدات في اليوم<input name="per" type="number" min={0} defaultValue={c.per_day ?? 2} style={{ width: 80 }} /></label>
          <label className="fld">مهلة الرد (دقيقة)<input name="win" type="number" defaultValue={c.window_min ?? 10} style={{ width: 80 }} /></label>
          <label className="fld">خصم الفايت (ساعة)<input name="ded" inputMode="decimal" defaultValue={c.deduct_hours ?? 1} style={{ width: 80 }} /></label>
          <label className="fld">أقصى بعد عن موقع الشغل (متر)<input name="max" type="number" defaultValue={c.max_m ?? 300} style={{ width: 90 }} /></label>
          <button className="btn pri">حفظ</button>
          <div className="muted" style={{ width: "100%", fontSize: 12.5 }}>عدد مخصوص لموظف معيّن (أو صفر لإعفائه) من بيانات مرتبه. الفايت بيتخصم في المرتب لوحده.</div>
        </form>
      )}
    </>
  );
}
