import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveRoute } from "../actions";

export default async function Routes() {
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: items }, { data: secs }, { data: routes }] = await Promise.all([
    sb.from("items").select("id,name").eq("active", true).eq("kind", "product").order("name"),
    sb.from("locations").select("id,name").eq("type", "section").eq("active", true).order("sort"),
    sb.from("current_routes").select("item_id,step,section_id").order("step"),
  ]);
  const edit = can(me, "items.edit");
  return (
    <>
      <div className="crumbs"><Link href="/production">أوامر الإنتاج</Link> ‹ <span>مشوار المنتجات</span></div>
      <div className="top"><h1>مشوار كل منتج على الغرف</h1></div>
      <div className="note">اختار الغرف بالترتيب اللي المنتج بيعدّي عليه. أي تعديل بيتحفظ كنسخة جديدة، والأوامر القديمة بتكمّل على المشوار اللي اتعملت بيه.</div>
      {(items ?? []).map((it) => {
        const r = (routes ?? []).filter((x) => Number(x.item_id) === Number(it.id)).map((x) => x.section_id as string);
        return (
          <form key={it.id} action={saveRoute} className="card row">
            <input type="hidden" name="item" value={it.id} />
            <b style={{ minWidth: 160 }}>{it.name}</b>
            {[0, 1, 2, 3, 4].map((i) => (
              <select key={i} name="step" defaultValue={r[i] ?? ""} disabled={!edit} style={{ width: 140 }}>
                <option value="">—</option>
                {(secs ?? []).map((s) => <option key={s.id} value={s.id}>{i + 1}) {s.name}</option>)}
              </select>
            ))}
            {edit && <button className="btn">احفظ</button>}
          </form>
        );
      })}
    </>
  );
}
