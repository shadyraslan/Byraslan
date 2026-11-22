import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { decidePriceChange } from "../actions";

type C = { id: number; item_id: number; location_id: string; channel: string; old_price: number | null; new_price: number; old_cost: number | null; new_cost: number; ref: string | null; status: string; at: string; items: { name: string } | null; locations: { name: string } | null };
const CH: Record<string, string> = { direct: "الفرع", app: "الأونلاين" };
const n = (x: number | null) => (x == null ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: 2 }));

export default async function PriceChanges({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  const me = await getMe();
  if (!can(me, "prices.edit") && !can(me, "purchase.edit")) redirect("/dashboard");
  const sb = await supabaseServer();
  let q = sb.from("price_changes").select("id,item_id,location_id,channel,old_price,new_price,old_cost,new_cost,ref,status,at,items(name),locations(name)").order("id", { ascending: false }).limit(200);
  if (ref) q = q.eq("ref", ref);
  const [{ data }, { data: cfg }] = await Promise.all([q, sb.from("settings").select("value").eq("key", "pricing.follow_cost").maybeSingle()]);
  const L = (data ?? []) as unknown as C[];
  const pend = L.filter((c) => c.status === "pending");
  const done = L.filter((c) => c.status !== "pending");
  const auto = (cfg?.value as { auto?: boolean } | null)?.auto !== false;
  const edit = can(me, "prices.edit");
  const row = (c: C) => (
    <tr key={c.id}>
      <td>{c.items?.name}</td><td>{c.locations?.name} · {CH[c.channel] ?? c.channel}</td>
      <td className="num">{n(c.old_cost)} ← <b>{n(c.new_cost)}</b></td>
      <td className="num">{n(c.old_price)} ← <b style={{ color: c.old_price != null && c.new_price < c.old_price ? "var(--good)" : undefined }}>{n(c.new_price)}</b></td>
      <td className="num" style={{ fontSize: 12 }}>{c.ref}<div className="muted">{new Date(c.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</div></td>
      <td>{c.status === "pending" ? (edit ? (
        <form action={decidePriceChange} className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
          <input type="hidden" name="id" value={c.id} />
          <input name="price" defaultValue={c.new_price} inputMode="decimal" dir="ltr" style={{ width: 80, height: 32 }} />
          <button name="ok" value="1" className="btn pri" style={{ height: 32 }}>طبّق</button>
          <button name="ok" value="0" className="btn" style={{ height: 32 }}>سيبه</button>
        </form>) : "مستني") : c.status === "applied" ? "✓ اتطبّق" : "اتساب"}</td>
    </tr>);
  const head = <thead><tr><th>الصنف</th><th>فين</th><th>التكلفة</th><th>سعر الرف</th><th>الاستلام</th><th></th></tr></thead>;
  return (
    <>
      <div className="crumbs"><Link href="/prices">الأسعار</Link> ‹ <span>أسعار اتغيّرت من الاستلام</span></div>
      <div className="top"><h1>سعر الرف بيتبع سعر الاستلام</h1><Link className="btn pri" href="/items/labels" style={{ display: "inline-grid", placeItems: "center" }}>اطبع ملصقات الأسعار الجديدة</Link></div>
      <div className="note" style={{ marginBottom: 12 }}>لما صنف سوبر ماركت يتستلم بتكلفة مختلفة، سعر الرف بيتحرك بنفس النسبة عشان يفضل نفس هامش الربح (لو التكلفة نزلت بعرض من المورد، السعر بينزل). {auto ? "السعر الجديد بيتطبّق لوحده" : "السعر الجديد بيستنى موافقتك هنا"} — من <Link href="/settings">الإعدادات</Link>.{ref ? <> عارض {ref} بس — <Link href="/prices/changes">اعرض الكل</Link></> : null}</div>
      {pend.length > 0 && <div className="card" style={{ overflowX: "auto", borderColor: "var(--y)" }}><h2>مستنية موافقتك</h2><table>{head}<tbody>{pend.map(row)}</tbody></table></div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>آخر التغييرات</h2>
        <table>{head}<tbody>{done.map(row)}{!done.length && <tr><td colSpan={6} className="muted">لسه مفيش</td></tr>}</tbody></table>
      </div>
    </>
  );
}
