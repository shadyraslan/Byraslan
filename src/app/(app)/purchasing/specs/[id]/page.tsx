import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../../Tabs";
import SpecEditor from "./SpecEditor";
import { saveItemSupplier, addAltBrand } from "../../actions";

export default async function Spec({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await getMe();
  const edit = can(me, "purchase.edit"), qa = can(me, "qa.approve");
  const sb = await supabaseServer();
  const [{ data: item }, { data: s }, { data: vers }, { data: isup }, { data: alts }, { data: sups }] = await Promise.all([
    sb.from("items").select("id,name,unit").eq("id", id).single(),
    sb.from("item_specs").select("*").eq("item_id", id).maybeSingle(),
    sb.from("item_spec_versions").select("version,what,approved_at").eq("item_id", id).order("version", { ascending: false }),
    sb.from("item_suppliers").select("rank,supplier_id,brand,price,suppliers(name,phone)").eq("item_id", id),
    sb.from("item_alt_brands").select("id,brand,note").eq("item_id", id),
    sb.from("suppliers").select("id,name").eq("active", true).order("name"),
  ]);
  if (!item) notFound();
  const init = {
    brand: s?.brand ?? "", description: s?.description ?? "", size: s?.size ?? "", temp_max: s?.temp_max?.toString() ?? "",
    min_shelf_days: s?.min_shelf_days?.toString() ?? "0", waste_pct: s?.waste_pct?.toString() ?? "0",
    checks: (s?.checks ?? []).join("\n"), certs: (s?.certs ?? []).join("\n"), img_ok: s?.img_ok ?? null, img_bad: s?.img_bad ?? null,
  };
  return (
    <div className="a4">
      <div className="top"><h1>كارت الصنف — {item.name}</h1></div>
      <div className="noprint"><Tabs cur="/purchasing/specs" /></div>
      <h1 className="onlyprint">كارت الصنف — {item.name}</h1>
      <SpecEditor item={id} init={init} edit={edit} qa={qa} dirty={!!s?.dirty} />
      <div className="card">
        <h2>الموردين (أساسي + بديلين)</h2>
        {[1, 2, 3].map((rank) => {
          const x = (isup ?? []).find((r) => r.rank === rank);
          const sup = x ? (Array.isArray(x.suppliers) ? x.suppliers[0] : x.suppliers) as { name: string; phone: string | null } | null : null;
          return (
            <form key={rank} action={saveItemSupplier} className="row" style={{ gap: 6 }}>
              <input type="hidden" name="item" value={id} /><input type="hidden" name="rank" value={rank} />
              <b style={{ width: 70 }}>{rank === 1 ? "الأساسي" : `بديل ${rank - 1}`}</b>
              <select name="supplier" defaultValue={x?.supplier_id ?? ""} disabled={!edit} style={{ flex: "1 1 160px" }}><option value="">—</option>{(sups ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
              <input name="brand" defaultValue={x?.brand ?? ""} placeholder="البراند عنده" disabled={!edit} style={{ width: 140 }} />
              <input name="price" defaultValue={x?.price ?? ""} placeholder="السعر" dir="ltr" disabled={!edit} style={{ width: 90 }} />
              {edit && <button className="btn">حفظ</button>}
              {sup?.phone && <a className="btn" href={`tel:${sup.phone}`} style={{ display: "inline-grid", placeItems: "center" }}>📞 {sup.phone}</a>}
            </form>
          );
        })}
      </div>
      <div className="card">
        <h2>براندات بديلة مقبولة</h2>
        {(alts ?? []).map((a) => <div key={a.id}>• <b>{a.brand}</b> {a.note && <span className="muted">— {a.note}</span>}</div>)}
        {!alts?.length && <div className="muted">مفيش</div>}
        {edit && <form action={addAltBrand} className="row" style={{ marginTop: 8 }}>
          <input type="hidden" name="item" value={id} />
          <input name="brand" placeholder="البراند" required /><input name="note" placeholder="ملاحظة" style={{ flex: "1 1 200px" }} />
          <button className="btn">+ براند</button>
        </form>}
      </div>
      <div className="card">
        <h2>سجل الاعتماد</h2>
        {(vers ?? []).map((v) => <div key={v.version} className="num">v{v.version} — {new Date(v.approved_at).toLocaleDateString("ar-EG")} {v.what && <span>— {v.what}</span>}</div>)}
        {!vers?.length && <div className="badmsg">المواصفة لسه ماتعتمدتش — الاستلام هيترفض لحد ما الجودة تعتمدها (أو تجاوز)</div>}
      </div>
    </div>
  );
}
