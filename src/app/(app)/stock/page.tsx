import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

type Row = { item_id: number; item_name: string; unit: string; location_id: string; location_name: string; qty: number; boxes: number };

export default async function Stock({ searchParams }: { searchParams: Promise<{ loc?: string }> }) {
  const { loc = "" } = await searchParams;
  const me = await getMe();
  if (!can(me, "stock.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: rows }, { data: locs }] = await Promise.all([
    sb.from("stock_by_location").select("*"),
    sb.from("locations").select("id,name,type").eq("active", true).neq("type", "section").order("sort"),
  ]);
  const R = ((rows ?? []) as unknown as Row[]).filter((r) => Math.abs(Number(r.qty)) > 0.0005 || Number(r.boxes) > 0);
  const L = (locs ?? []).filter((l) => !loc || l.id === loc);
  const items = [...new Map(R.map((r) => [r.item_id, r])).values()].sort((a, b) => a.item_name.localeCompare(b.item_name, "ar"));
  const cell = (item: number, l: string) => R.find((r) => r.item_id === item && r.location_id === l);
  return (
    <>
      <div className="top"><h1>المخزون</h1>
        <div className="row">
          {can(me, "stock.edit") && <Link className="btn pri" href="/transfers/new" style={{ display: "inline-grid", placeItems: "center" }}>+ تحويل بالمسح</Link>}
          {(can(me, "stock.count") || can(me, "stock.adjust")) && <Link className="btn" href="/stock/count" style={{ display: "inline-grid", placeItems: "center" }}>الجرد</Link>}
          <Link className="btn" href="/transfers" style={{ display: "inline-grid", placeItems: "center" }}>التحويلات</Link>
          {(can(me, "stock.waste") || can(me, "stock.donate")) && <Link className="btn" href="/stock/dispose" style={{ display: "inline-grid", placeItems: "center" }}>هالك وتبرعات</Link>}
          <Link className="btn" href="/boxes" style={{ display: "inline-grid", placeItems: "center" }}>تتبّع علبة</Link>
        </div>
      </div>
      <form className="card row">
        <label className="fld">الموقع<select name="loc" defaultValue={loc}><option value="">كل المواقع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button className="btn">اعرض</button>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الصنف</th>{L.map((l) => <th key={l.id} style={{ textAlign: "center" }}>{l.name}</th>)}</tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.item_id}>
                <td><b>{it.item_name}</b> <span className="muted" style={{ fontSize: 12 }}>{it.unit}</span></td>
                {L.map((l) => {
                  const c = cell(it.item_id, l.id);
                  return <td key={l.id} style={{ textAlign: "center" }}>{c ? <><b className="num">{Number(c.qty).toFixed(it.unit === "قطعة" ? 0 : 2)}</b>{Number(c.boxes) > 0 && <div className="muted" style={{ fontSize: 11.5 }}>{c.boxes} علبة</div>}</> : <span className="muted">—</span>}</td>;
                })}
              </tr>
            ))}
            {!items.length && <tr><td colSpan={L.length + 1} className="muted">مفيش رصيد لسه — أول علبة بتتغلّف بتظهر هنا</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="note">الرصيد محسوب من دفتر الحركات: كل تغليف وتحويل وبيع وهالك سطر، ومفيش رقم بيتكتب باليد. علب روستو بتتعدّ برقمها المميز.</div>
    </>
  );
}
