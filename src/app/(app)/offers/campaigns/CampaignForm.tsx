const COLORS = ["#E11D48", "#EA580C", "#16A34A", "#2563EB", "#7C3AED", "#0D0D0D"];
const local = (s?: string | null) => (s ? new Date(s).toLocaleString("sv-SE", { timeZone: "Africa/Cairo" }).slice(0, 16).replace(" ", "T") : "");
type C = { id: number; name: string; subtitle: string | null; color: string; starts_at: string; ends_at: string; locations: string[] | null; channels: string[] };

/** بيانات المهرجان: الاسم واللون والمدة والفروع والقنوات */
export default function CampaignForm({ action, locs, c }: { action: (fd: FormData) => Promise<void>; locs: { id: string; name: string }[]; c?: C }) {
  return (
    <form action={action} className="card" style={{ display: "grid", gap: 8 }}>
      <b>{c ? "بيانات المهرجان" : "مهرجان جديد"}</b>
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="row">
        <label className="fld" style={{ flex: 2 }}>الاسم (بيظهر على الملصق والتطبيق)<input name="name" required defaultValue={c?.name ?? ""} placeholder="مهرجان الشتا، أسبوع الزيوت…" /></label>
        <label className="fld" style={{ flex: 2 }}>جملة صغيرة<input name="subtitle" defaultValue={c?.subtitle ?? ""} placeholder="خصومات لحد 30%" /></label>
      </div>
      <div className="row">
        <label className="fld">من<input type="datetime-local" name="starts" required defaultValue={local(c?.starts_at)} /></label>
        <label className="fld">لحد<input type="datetime-local" name="ends" required defaultValue={local(c?.ends_at)} /></label>
        <div className="fld">لون الملصق<div className="row" style={{ gap: 6 }}>{COLORS.map((x, i) => (
          <label key={x} style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: x, cursor: "pointer" }}>
            <input type="radio" name="color" value={x} defaultChecked={c ? c.color === x : i === 0} style={{ accentColor: "#fff" }} />
          </label>))}</div></div>
      </div>
      <div><b>القنوات: </b>
        <label style={{ marginInlineEnd: 12 }}><input type="checkbox" name="ch" value="direct" defaultChecked={c ? c.channels.includes("direct") : true} /> الكاشير والرف</label>
        <label><input type="checkbox" name="ch" value="app" defaultChecked={c ? c.channels.includes("app") : true} /> التطبيق والويب</label>
      </div>
      <details open={!!c?.locations?.length}><summary><b>الفروع</b> (من غير اختيار = كل الفروع)</summary>
        {locs.map((l) => <label key={l.id} style={{ marginInlineEnd: 12 }}><input type="checkbox" name="loc" value={l.id} defaultChecked={!!c?.locations?.includes(l.id)} /> {l.name}</label>)}
      </details>
      <button className="btn pri" style={{ justifySelf: "start" }}>{c ? "حفظ" : "اعمل المهرجان وضيف الأصناف"}</button>
    </form>
  );
}
