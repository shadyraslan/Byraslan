import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveRoute, saveYieldTol } from "../actions";

export default async function Routes() {
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: items }, { data: secs }, { data: routes }] = await Promise.all([
    sb.from("items").select("id,name").eq("active", true).eq("kind", "product").order("name"),
    sb.from("locations").select("id,name").eq("type", "section").eq("active", true).order("sort"),
    sb.from("current_routes").select("item_id,step,section_id,yield_pct").order("step"),
  ]);
  const { data: yc } = await sb.from("settings").select("value").eq("key", "prod_yield").maybeSingle();
  const tol = Number((yc?.value as { tol_pct?: number } | null)?.tol_pct ?? 5);
  const edit = can(me, "items.edit");
  return (
    <>
      <div className="crumbs"><Link href="/production">أوامر الإنتاج</Link> ‹ <span>مشوار المنتجات</span></div>
      <div className="top"><h1>مشوار كل منتج على الغرف</h1></div>
      <div className="note">اختار الغرف بالترتيب اللي المنتج بيعدّي عليه، وجنب كل غرفة <b>الناتج المتوقع %</b> من الوزن الداخل (التقطيع مثلاً 85%، التتبيل ممكن يزوّد 110%، 100% = مفيش تغيير). التابلت بيقبل لحد المتوقع + السماح، ولو الناتج أقل من المتوقع − السماح بيطلع تنبيه. أي تعديل بيتحفظ كنسخة جديدة، والأوامر القديمة بتكمّل على المشوار والمعادلة اللي اتعملت بيهم.</div>
      {can(me, "settings.edit") && (
        <form action={saveYieldTol} className="card row" style={{ alignItems: "end" }}>
          <label className="fld">السماح فوق وتحت الناتج المتوقع (%)<input name="tol" defaultValue={tol} inputMode="decimal" dir="ltr" style={{ width: 80 }} /></label>
          <button className="btn">احفظ</button>
        </form>
      )}
      {(items ?? []).map((it) => {
        const rr = (routes ?? []).filter((x) => Number(x.item_id) === Number(it.id));
        const r = rr.map((x) => x.section_id as string);
        return (
          <form key={it.id} action={saveRoute} className="card row">
            <input type="hidden" name="item" value={it.id} />
            <b style={{ minWidth: 160 }}>{it.name}</b>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
                <select name="step" defaultValue={r[i] ?? ""} disabled={!edit} style={{ width: 130 }}>
                  <option value="">—</option>
                  {(secs ?? []).map((s) => <option key={s.id} value={s.id}>{i + 1}) {s.name}</option>)}
                </select>
                <input name="yield" defaultValue={rr[i]?.yield_pct ?? 100} disabled={!edit} inputMode="decimal" dir="ltr" title="الناتج المتوقع %" style={{ width: 52 }} /><span className="muted">%</span>
              </span>
            ))}
            {edit && <button className="btn">احفظ</button>}
          </form>
        );
      })}
    </>
  );
}
