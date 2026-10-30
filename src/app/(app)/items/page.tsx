import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { addFamily, addItem } from "./actions";

const ARM: Record<string, string> = { rostos: "روستو", market: "رسلان ماركت", oricci: "أوريتشي" };

export default async function Items({ searchParams }: { searchParams: Promise<{ q?: string; arm?: string }> }) {
  const { q = "", arm = "" } = await searchParams;
  const me = await getMe();
  const sb = await supabaseServer();
  let iq = sb.from("items").select("id,name,arm,unit,family_id,tags,active").order("name").limit(300);
  if (arm) iq = iq.eq("arm", arm);
  if (q) iq = iq.or(`name.ilike.%${q}%,tags.cs.{${q.replace(/[{},#]/g, "")}}`);
  const [{ data: fams }, { data: items }] = await Promise.all([sb.from("families").select("id,name,parent_id,arm,tag").order("name"), iq]);
  const fName = (id: number | null) => {
    const f = (fams ?? []).find((x) => x.id === id);
    if (!f) return "—";
    const p = (fams ?? []).find((x) => x.id === f.parent_id);
    return p ? `${p.name} ← ${f.name}` : f.name;
  };
  const edit = can(me, "items.edit");
  return (
    <>
      <div className="top"><h1>الأصناف والعائلات</h1></div>
      <form className="card row">
        <label className="fld">بحث (اسم أو #هاشتاج)<input name="q" defaultValue={q} /></label>
        <label className="fld">الذراع<select name="arm" defaultValue={arm}><option value="">الكل</option>{Object.entries(ARM).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
        <button className="btn">اعرض</button>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>الصنف</th><th>الذراع</th><th>الوحدة</th><th>العائلة</th><th>هاشتاجز</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}><td><b>{i.name}</b></td><td>{ARM[i.arm] ?? i.arm}</td><td>{i.unit}</td><td>{fName(i.family_id)}</td><td className="muted">{(i.tags ?? []).map((t: string) => "#" + t).join(" ")}</td></tr>
            ))}
            {!items?.length && <tr><td colSpan={5} className="muted">مفيش أصناف لسه</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="grid2">
          <form action={addItem} className="card">
            <h2>صنف جديد</h2>
            <div className="row">
              <label className="fld">الاسم<input name="name" required /></label>
              <label className="fld">الذراع<select name="arm">{Object.entries(ARM).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="fld">الوحدة<select name="unit"><option>كجم</option><option>قطعة</option><option>علبة</option><option>لتر</option></select></label>
              <label className="fld">العائلة<select name="family_id"><option value="">—</option>{(fams ?? []).map((f) => <option key={f.id} value={f.id}>{fName(f.id)}</option>)}</select></label>
              <label className="fld">هاشتاجز (بمسافة)<input name="tags" placeholder="ألبان فطار" /></label>
              <label className="fld">باركود<input name="barcode" dir="ltr" /></label>
              <button className="btn pri">ضيف</button>
            </div>
          </form>
          <form action={addFamily} className="card">
            <h2>عائلة / عائلة فرعية</h2>
            <div className="row">
              <label className="fld">الاسم<input name="name" required /></label>
              <label className="fld">الذراع<select name="arm">{Object.entries(ARM).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
              <label className="fld">تحت عائلة<select name="parent_id"><option value="">— رئيسية —</option>{(fams ?? []).filter((f) => !f.parent_id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label className="fld">هاشتاج العائلة<input name="tag" /></label>
              <button className="btn pri">ضيف</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
