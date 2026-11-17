import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

type R = { item_id: number; name: string; unit: string; kind: string; arm: string; loc: string; loc_name: string; loc_type: string; min: number; qty: number; short: number };

/** النواقص: كل صنف نزل عن الحد الأدنى في مكان — مع الاقتراح: أمر إنتاج (المصنع) أو تحويل (الفروع) أو أمر توريد (خامات وسوبر ماركت) */
export default async function Low() {
  const me = await getMe();
  if (!can(me, "stock.view") && !can(me, "prod.orders")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.rpc("stock_low", { p_loc: null });
  const L = (data ?? []) as R[];
  const r3 = (n: number) => Math.round(Number(n) * 1000) / 1000;
  const act = (r: R) => {
    if (r.kind === "product" && r.arm !== "market" && r.loc_type === "factory") return can(me, "prod.orders") ? <Link className="btn pri" href={`/production?item=${r.item_id}&qty=${Math.ceil(r.short)}`}>اعمل أمر إنتاج {Math.ceil(r.short)}</Link> : <span className="muted">أمر إنتاج</span>;
    if (["dark", "shop"].includes(r.loc_type)) return can(me, "stock.edit") ? <Link className="btn pri" href="/transfers/new">حوّل من المصنع / المخزن</Link> : <span className="muted">تحويل للفرع</span>;
    return can(me, "purchase.edit") ? <Link className="btn pri" href="/purchasing">أمر توريد</Link> : <span className="muted">أمر توريد</span>;
  };
  return (
    <>
      <div className="top"><h1>النواقص {L.length ? `· ${L.length}` : ""}</h1></div>
      <div className="muted" style={{ marginBottom: 10 }}>الحد الأدنى بيتحدد لكل صنف في كل مكان من صفحة الصنف. هنا الاقتراح بس — محدش بيتعمل له أمر لوحده من غير موافقة.</div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الصنف</th><th>المكان</th><th>الرصيد</th><th>الحد الأدنى</th><th>الناقص</th><th>الاقتراح</th></tr></thead>
          <tbody>{L.map((r) => (
            <tr key={`${r.item_id}-${r.loc}`}>
              <td><Link href={`/items/${r.item_id}`}><b>{r.name}</b></Link></td>
              <td>{r.loc_name}</td>
              <td className="num">{r3(r.qty)} {r.unit}</td>
              <td className="num">{r3(r.min)}</td>
              <td className="num" style={{ color: "var(--bad)", fontWeight: 800 }}>{r3(r.short)}</td>
              <td>{act(r)}</td>
            </tr>))}
            {!L.length && <tr><td colSpan={6} className="muted">مفيش نواقص — أو لسه محدش حط حد أدنى للأصناف.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
