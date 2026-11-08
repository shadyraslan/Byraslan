import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../Tabs";

export default async function Specs() {
  const me = await getMe();
  if (!can(me, "purchase.edit")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: items }, { data: specs }, { data: cur }, { data: isup }] = await Promise.all([
    sb.from("items").select("id,name,unit,kind").eq("active", true).in("kind", ["raw", "mix", "pack", "semi"]).order("name"),
    sb.from("item_specs").select("item_id,brand,dirty"),
    sb.from("spec_current").select("item_id,version,approved_at"),
    sb.from("item_suppliers").select("item_id,rank,suppliers(name)"),
  ]);
  const S = new Map<number, { brand: string | null; dirty: boolean }>(((specs ?? []) as unknown as { item_id: number; brand: string | null; dirty: boolean }[]).map((s) => [Number(s.item_id), s]));
  const C = new Map<number, { version: number }>(((cur ?? []) as unknown as { item_id: number; version: number }[]).map((s) => [Number(s.item_id), s]));
  return (
    <>
      <div className="top"><h1>كارت الصنف</h1></div>
      <Tabs cur="/purchasing/specs" />
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الصنف</th><th>البراند</th><th>الموردين</th><th>الحالة</th></tr></thead>
          <tbody>
            {(items ?? []).map((i) => {
              const s = S.get(Number(i.id)), c = C.get(Number(i.id));
              const sups = (isup ?? []).filter((x) => Number(x.item_id) === Number(i.id)).sort((a, b) => a.rank - b.rank);
              const st = !s ? ["مفيش مواصفة", "var(--bad)"] : !c ? ["مش معتمدة", "var(--bad)"] : s.dirty ? [`معتمدة v${c.version} — فيه تعديل مستني`, "#b7791f"] : [`معتمدة v${c.version}`, "var(--ok)"];
              return (
                <tr key={i.id}>
                  <td><Link href={`/purchasing/specs/${i.id}`}><b>{i.name}</b></Link></td>
                  <td>{s?.brand ?? "—"}</td>
                  <td style={{ fontSize: 12.5 }}>{sups.map((x) => { const n = Array.isArray(x.suppliers) ? x.suppliers[0]?.name : (x.suppliers as { name: string } | null)?.name; return <div key={x.rank}>{x.rank === 1 ? "الأساسي" : `بديل ${x.rank - 1}`}: {n}</div>; })}{!sups.length && <span className="muted">—</span>}</td>
                  <td style={{ color: st[1] }}>{st[0]}</td>
                </tr>
              );
            })}
            {!items?.length && <tr><td colSpan={4} className="muted">ضيف خامات من شاشة الأصناف الأول</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
