import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { giveAsset, returnAsset } from "../more-actions";

type A = { id: number; user_id: string; name: string; serial: string | null; value: number; note: string | null; given_at: string; acked_at: string | null; returned_at: string | null; condition: string | null };

/** العهد العينية: يونيفورم، موبايل، مفاتيح… الموظف بيأكّد الاستلام، واللي مارجعش بيتخصم في المخالصة */
export default async function Assets({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; all?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.assets") && !can(me, "hr.settle")) redirect("/dashboard");
  const sb = await supabaseServer();
  let q = sb.from("custody_assets").select("*").order("id", { ascending: false });
  if (!sp.all) q = q.is("returned_at", null);
  const [{ data }, { data: people }] = await Promise.all([q, sb.from("profiles").select("id,name").eq("is_owner", false).order("name")]);
  const PN = new Map((people ?? []).map((p) => [p.id, p.name]));
  const L = (data ?? []) as A[];
  return (
    <>
      <div className="top"><h1>العهد العينية</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      {can(me, "hr.assets") && (
        <form action={giveAsset} className="card row" style={{ alignItems: "end" }}>
          <label className="fld">الموظف<select name="user" required defaultValue=""><option value="" disabled>اختار</option>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="fld">العهدة<input name="name" required placeholder="يونيفورم، موبايل، مفتاح الفرع…" list="asset-names" /></label>
          <datalist id="asset-names">{["يونيفورم", "حذاء سيفتي", "موبايل", "شريحة", "مفتاح الفرع", "تابلت", "ميزان", "ماكينة فيزا"].map((x) => <option key={x} value={x} />)}</datalist>
          <label className="fld">السيريال<input name="serial" dir="ltr" style={{ width: 130 }} /></label>
          <label className="fld">القيمة (ج)<input name="value" inputMode="decimal" dir="ltr" style={{ width: 90 }} /></label>
          <label className="fld" style={{ flex: 1 }}>ملاحظة<input name="note" /></label>
          <button className="btn pri">سلّم</button>
        </form>
      )}
      <div className="row" style={{ gap: 6, margin: "8px 0" }}><a className={sp.all ? "btn" : "btn pri"} href="/hr/assets">مع الموظفين</a><a className={sp.all ? "btn pri" : "btn"} href="/hr/assets?all=1">الكل</a></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الموظف</th><th>العهدة</th><th>القيمة</th><th>من</th><th>استلم؟</th><th>رجعت</th><th></th></tr></thead>
          <tbody>
            {L.map((a) => (
              <tr key={a.id}>
                <td><b>{PN.get(a.user_id)}</b></td><td>{a.name}{a.serial && <span className="muted" dir="ltr"> {a.serial}</span>}{a.note && <div className="muted" style={{ fontSize: 12 }}>{a.note}</div>}</td>
                <td className="num">{money(a.value)} ج</td><td className="muted">{a.given_at}</td><td>{a.acked_at ? "✅" : "⏳ لسه"}</td>
                <td>{a.returned_at ? `${a.returned_at} — ${a.condition}` : "—"}</td>
                <td>{can(me, "hr.assets") && !a.returned_at && <form action={returnAsset} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={a.id} /><input name="cond" placeholder="حالتها" style={{ width: 100 }} /><button className="btn">رجعت</button></form>}</td>
              </tr>
            ))}
            {!L.length && <tr><td colSpan={7} className="muted">مفيش عهد</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
