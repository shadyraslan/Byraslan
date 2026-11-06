import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

async function saveDistrict(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const id = Number(fd.get("id") || 0);
  const row = {
    name: String(fd.get("name") || "").trim(),
    city: String(fd.get("city") || "").trim(),
    branch: String(fd.get("branch") || "") || null,
    backup: String(fd.get("backup") || "") || null,
    fee: Number(fd.get("fee") || 0),
    active: fd.get("active") === "on",
  };
  if (!row.name || !row.city) return;
  if (id) await sb.from("districts").update(row).eq("id", id);
  else await sb.from("districts").insert({ ...row, active: true, sort: 999 });
  revalidatePath("/zones");
}

export default async function Zones() {
  const me = await getMe();
  if (!can(me, "settings.edit") && !can(me, "orders.handle")) redirect("/dashboard");
  const edit = can(me, "settings.edit");
  const sb = await supabaseServer();
  const [{ data: ds }, { data: locs }, { data: miss }, { data: addrs }] = await Promise.all([
    sb.from("districts").select("*").order("city", { ascending: false }).order("sort").order("name"),
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
    sb.from("zone_misses").select("district_id,text,at").order("id", { ascending: false }).limit(200),
    sb.from("customer_addresses").select("district_id").eq("active", true),
  ]);
  const D = ds ?? [];
  const L = locs ?? [];
  const LN = new Map(L.map((l) => [l.id as string, l.name as string]));
  const cust = (id: number) => (addrs ?? []).filter((a) => Number(a.district_id) === id).length;
  const missBy = (id: number) => (miss ?? []).filter((m) => Number(m.district_id) === id).length;
  const sel = (name: string, v: string | null) => (
    <select name={name} defaultValue={v ?? ""} disabled={!edit} style={{ height: 34 }}>
      <option value="">— مش متغطية —</option>{L.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
    </select>
  );
  return (
    <>
      <div className="top"><h1>مناطق التوصيل</h1></div>
      <div className="card muted" style={{ fontSize: 13.5 }}>
        العميل بيختار حيّه في التطبيق أو صفحة الطلب، والطلب بيروح للفرع الأساسي للحي ده. لو الأساسي مقفول، بيروح للاحتياطي. سعر التوصيل بيتحسب من الحي.
        الحي اللي مالوش فرع بيظهر للعميل "لسه مش متغطية"، وعنوانه بيتسجّل تحت عشان يساعد في اختيار مكان الفرع الجاي.
      </div>
      {[...new Set(L.map((l) => l.id as string))].length > 0 && (
        <div className="kpis">
          {L.map((l) => <div key={l.id} className="kpi"><span>{l.name}</span><b className="num">{D.filter((d) => d.branch === l.id && d.active).length}</b><small>حي أساسي</small></div>)}
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الحي</th><th>المدينة</th><th>الفرع الأساسي</th><th>الاحتياطي</th><th>التوصيل ج</th><th>شغال</th><th>عملاء</th><th>طلبات برّه</th><th></th></tr></thead>
          <tbody>
            {D.map((d) => (
              <tr key={d.id} style={!d.branch ? { background: "color-mix(in srgb, var(--bad) 7%, transparent)" } : undefined}>
                <td colSpan={9} style={{ padding: 0 }}>
                  <form action={saveDistrict} className="row" style={{ gap: 6, padding: "6px 8px", flexWrap: "nowrap" }}>
                    <input type="hidden" name="id" value={d.id} />
                    <input name="name" defaultValue={d.name} disabled={!edit} style={{ width: 130, height: 34 }} />
                    <input name="city" defaultValue={d.city} disabled={!edit} style={{ width: 100, height: 34 }} />
                    {sel("branch", d.branch)}
                    {sel("backup", d.backup)}
                    <input name="fee" defaultValue={d.fee} disabled={!edit} dir="ltr" style={{ width: 70, height: 34 }} />
                    <input type="checkbox" name="active" defaultChecked={d.active} disabled={!edit} style={{ width: 20, height: 20 }} />
                    <span className="num" style={{ width: 50 }}>{cust(Number(d.id))}</span>
                    <span className="num" style={{ width: 60, color: missBy(Number(d.id)) ? "var(--bad)" : undefined }}>{missBy(Number(d.id))}</span>
                    {edit && <button className="btn" style={{ height: 34 }}>حفظ</button>}
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form action={saveDistrict} className="card row">
          <h2 style={{ width: "100%" }}>حي جديد</h2>
          <input name="name" placeholder="اسم الحي" required />
          <input name="city" placeholder="المدينة" required defaultValue="إسكندرية" />
          {sel("branch", null)}{sel("backup", null)}
          <input name="fee" placeholder="سعر التوصيل" dir="ltr" style={{ width: 110 }} />
          <button className="btn pri">+ ضيف الحي</button>
        </form>
      )}
      <div className="card">
        <h2>آخر عناوين برّه المناطق</h2>
        {(miss ?? []).slice(0, 30).map((m, i) => <div key={i} style={{ fontSize: 13.5 }}>• {D.find((d) => Number(d.id) === Number(m.district_id))?.name ?? "—"} — {m.text} <span className="muted num">{new Date(m.at).toLocaleDateString("en-CA")}</span></div>)}
        {!miss?.length && <div className="muted">مفيش</div>}
      </div>
      <div className="muted" style={{ fontSize: 12.5 }}>الفروع: {L.map((l) => LN.get(l.id as string)).join(" · ")}</div>
    </>
  );
}
