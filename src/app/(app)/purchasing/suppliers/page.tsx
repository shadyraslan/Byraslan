import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../Tabs";
import { addSupplier, updateSupplier } from "../actions";

export default async function Suppliers() {
  const me = await getMe();
  const edit = can(me, "purchase.edit");
  const sb = await supabaseServer();
  const { data: sups } = await sb.from("suppliers").select("id,name,phone,terms").order("name");
  return (
    <>
      <div className="top"><h1>الموردين</h1></div>
      <Tabs cur="/purchasing/suppliers" />
      {edit && (
        <form action={addSupplier} className="card row">
          <label className="fld">الاسم<input name="name" required /></label>
          <label className="fld">الموبايل<input name="phone" inputMode="tel" dir="ltr" /></label>
          <label className="fld">شروط الدفع<input name="terms" placeholder="مثلًا: آجل 7 أيام" /></label>
          <button className="btn pri">+ مورد</button>
        </form>
      )}
      <div className="card">
        <table>
          <thead><tr><th>المورد</th><th>الموبايل والشروط</th></tr></thead>
          <tbody>
            {(sups ?? []).map((s) => (
              <tr key={s.id}><td><b>{s.name}</b></td>
                <td>{edit ? (
                  <form action={updateSupplier} className="row" style={{ gap: 6 }}>
                    <input type="hidden" name="id" value={s.id} />
                    <input name="phone" defaultValue={s.phone ?? ""} dir="ltr" style={{ width: 140, height: 34 }} />
                    <input name="terms" defaultValue={s.terms ?? ""} style={{ width: 160, height: 34 }} />
                    <button className="btn" style={{ height: 34 }}>حفظ</button>
                    {s.phone && <a className="btn" href={`tel:${s.phone}`} style={{ height: 34, display: "inline-grid", placeItems: "center" }}>📞</a>}
                  </form>) : <span className="num">{s.phone} {s.terms}</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
