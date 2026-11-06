import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { addLocation, saveGeo, toggleLocation } from "./actions";

const LTYPE: Record<string, string> = {
  factory: "مصنع", section: "قسم مصنع", warehouse: "مخزن", sub: "مخزن فرعي", dark: "دارك ستور",
  shop: "فرع بيع مباشر", partner: "مخزن شريك (وهمي)", donation: "مخزن تبرعات",
};

export default async function Locations() {
  const me = await getMe();
  const sb = await supabaseServer();
  const { data: locs, error } = await sb.from("locations").select("*").order("sort");
  const edit = can(me, "stock.edit");
  return (
    <>
      <div className="top"><h1>المواقع</h1></div>
      {error && <div className="card err">{error.message}</div>}
      <div className="card">
        <table>
          <thead><tr><th>الموقع</th><th>النوع</th><th>تابع لـ</th><th>المدينة</th><th>مكانه للحضور (lat, lng) · النطاق بالمتر</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {(locs ?? []).map((l) => (
              <tr key={l.id}>
                <td><b>{l.type === "section" ? "↳ " : ""}{l.name}</b> <span className="muted" dir="ltr">{l.id}</span></td>
                <td>{LTYPE[l.type] ?? l.type}</td>
                <td>{(locs ?? []).find((p) => p.id === l.parent)?.name ?? "—"}</td>
                <td>{l.city ?? ""}</td>
                <td>{edit ? (
                  <form action={saveGeo} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <input type="hidden" name="id" value={l.id} />
                    <input name="geo" defaultValue={l.lat != null ? `${l.lat}, ${l.lng}` : ""} placeholder="31.2346, 29.9590" dir="ltr" style={{ width: 170, height: 32 }} title="من جوجل مابس: كليك يمين على المكان وانسخ الأرقام" />
                    <input name="radius" defaultValue={l.radius_m ?? 150} dir="ltr" style={{ width: 60, height: 32 }} />
                    <button className="btn" style={{ height: 32 }}>حفظ</button>
                  </form>) : <span className="num">{l.lat != null ? `${l.lat}, ${l.lng} · ${l.radius_m}م` : "—"}</span>}</td>
                <td><span className="pill">{l.active ? "شغال" : "متوقف"}</span></td>
                <td>{edit && <form action={toggleLocation}><input type="hidden" name="id" value={l.id} /><button className="btn">{l.active ? "وقّف" : "شغّل"}</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form action={addLocation} className="card">
          <h2>موقع جديد</h2>
          <div className="row">
            <label className="fld">الكود (إنجليزي)<input name="id" required pattern="[a-z0-9-]+" dir="ltr" /></label>
            <label className="fld">الاسم<input name="name" required /></label>
            <label className="fld">النوع<select name="type">{Object.entries(LTYPE).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></label>
            <label className="fld">تابع لـ<select name="parent"><option value="">—</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            <label className="fld">المدينة<input name="city" /></label>
            <button className="btn pri">ضيف</button>
          </div>
        </form>
      )}
    </>
  );
}
