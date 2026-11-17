import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveMins } from "./actions";
import Photo from "./Photo";

type S = { location_id: string; qty: number; boxes: number };
type B = { sn: number; weight: number; location_id: string; packed_at: string; expires_at: string | null; prod_order: string | null; crate: string | null };
const KIND: Record<string, string> = { product: "منتج نهائي", semi: "نص مصنع", raw: "خامة", mix: "خلطة", pack: "تغليف" };
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** الصنف: المخزون في كل مكان، أرقام الأطباق (العلب) بالوزن والصلاحية، والحد الأدنى — عشان الجرد والتحويلات والهالك */
export default async function Item({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; loc?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getMe();
  if (!["stock.view", "items.edit", "prod.orders"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const iid = Number(id);
  const { data: it } = await sb.from("items").select("id,name,unit,kind,arm,photo,code,shelf_days,scale_plu,sold_by").eq("id", iid).maybeSingle();
  if (!it) notFound();
  const [{ data: st }, { data: bx }, { data: locs }, { data: mins }, { data: bcs }] = await Promise.all([
    sb.from("stock_by_location").select("location_id,qty,boxes").eq("item_id", iid),
    sb.from("boxes").select("sn,weight,location_id,packed_at,expires_at,prod_order,crate").eq("item_id", iid).eq("status", "stock").order("expires_at", { ascending: true, nullsFirst: false }).limit(1000),
    sb.from("locations").select("id,name,type").eq("active", true).neq("type", "section").order("sort"),
    sb.from("stock_min").select("location_id,min_qty").eq("item_id", iid),
    sb.from("item_barcodes").select("code").eq("item_id", iid),
  ]);
  const S = (st ?? []) as S[];
  const Bx = ((bx ?? []) as B[]).filter((b) => !sp.loc || b.location_id === sp.loc);
  const L = locs ?? [];
  const LN = new Map(L.map((l) => [l.id as string, l.name as string]));
  const M = new Map<string, number>((mins ?? []).map((m) => [m.location_id as string, Number(m.min_qty)]));
  const now = Date.now();
  const days = (s: string | null) => (s ? Math.floor((new Date(s).getTime() - now) / 864e5) : null);
  const total = S.reduce((a, s) => a + Number(s.qty), 0);
  return (
    <>
      <div className="top"><h1>{it.name}</h1><Link className="btn" href="/items" style={{ display: "inline-grid", placeItems: "center" }}>→ الأصناف</Link></div>
      {sp.ok && <div className="okmsg">اتحفظ</div>}
      <div className="card row" style={{ gap: 18, alignItems: "center" }}>
        {can(me, "items.edit") ? <Photo item={iid} photo={it.photo as string | null} code={String((bcs ?? [])[0]?.code ?? it.code ?? it.id)} /> : it.photo ? <img src={it.photo as string} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 12 }} /> : null}
        <div><div className="muted">النوع</div><b>{KIND[it.kind as string] ?? it.kind}{it.arm === "market" ? " · سوبر ماركت" : ""}</b></div>
        <div><div className="muted">الرصيد كله</div><b className="num">{r3(total)} {it.unit}</b></div>
        <div><div className="muted">أطباق في المخزون</div><b className="num">{(bx ?? []).length}</b></div>
        <div><div className="muted">الصلاحية</div><b>{it.shelf_days ? `${it.shelf_days} يوم` : "—"}</b></div>
        <div className="row" style={{ gap: 6, marginInlineStart: "auto" }}>
          {can(me, "stock.edit") && <Link className="btn" href="/transfers/new">تحويل</Link>}
          <Link className="btn" href="/stock/count">جرد</Link>
          <Link className="btn" href="/stock/dispose">هالك / تبرعات</Link>
          <Link className="btn" href="/stock/expiry">الصلاحية</Link>
        </div>
      </div>
      <form action={saveMins} className="card" style={{ overflowX: "auto" }}>
        <input type="hidden" name="item" value={iid} />
        <h2 style={{ marginTop: 0 }}>المخزون في كل مكان</h2>
        <table>
          <thead><tr><th>المكان</th><th>الرصيد</th><th>أطباق</th><th>الحد الأدنى</th><th></th></tr></thead>
          <tbody>{L.map((l) => {
            const s = S.find((x) => x.location_id === l.id); const q = Number(s?.qty ?? 0); const mn = M.get(l.id as string) ?? 0;
            if (!s && !mn && !can(me, "stock.min")) return null;
            return (
              <tr key={l.id} style={{ color: mn > 0 && q < mn ? "var(--bad)" : undefined }}>
                <td><b>{l.name}</b></td>
                <td className="num">{r3(q)} {it.unit}</td>
                <td className="num">{s?.boxes ? <Link href={`/items/${iid}?loc=${l.id}`}>{s.boxes}</Link> : "—"}</td>
                <td>{can(me, "stock.min") ? <input name={`min:${l.id}`} defaultValue={mn || ""} inputMode="decimal" dir="ltr" style={{ width: 90, height: 32 }} /> : <span className="num">{mn || "—"}</span>}</td>
                <td>{mn > 0 && q < mn ? `ناقص ${r3(mn - q)}` : ""}</td>
              </tr>);
          })}</tbody>
        </table>
        {can(me, "stock.min") && <button className="btn pri" style={{ marginTop: 8 }}>احفظ الحد الأدنى</button>}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>لو الرصيد نزل عن الحد الأدنى بيظهر في «النواقص» مع اقتراح أمر إنتاج أو تحويل.</div>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>أرقام الأطباق {sp.loc ? `— ${LN.get(sp.loc) ?? sp.loc}` : ""} ({Bx.length})</h2>
          {sp.loc && <Link href={`/items/${iid}`} className="btn">كل الأماكن</Link>}
        </div>
        <table style={{ marginTop: 6 }}>
          <thead><tr><th>رقم الطبق</th><th>الوزن</th><th>المكان</th><th>اتغلّف</th><th>الصلاحية</th><th>أمر الإنتاج</th></tr></thead>
          <tbody>{Bx.map((b) => { const d = days(b.expires_at); return (
            <tr key={b.sn} style={{ color: d != null && d < 0 ? "var(--bad)" : d != null && d < 1 ? "#b7791f" : undefined }}>
              <td className="num"><Link href={`/boxes?sn=${b.sn}`}><b>#{b.sn}</b></Link></td>
              <td className="num">{b.weight} {it.unit}</td>
              <td>{LN.get(b.location_id) ?? b.location_id}{b.crate ? ` · قفص ${b.crate}` : ""}</td>
              <td>{new Date(b.packed_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}</td>
              <td>{b.expires_at ? `${new Date(b.expires_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}${d! < 0 ? " · خلصت" : d === 0 ? " · النهارده" : ` · فاضل ${d} يوم`}` : "—"}</td>
              <td className="num">{b.prod_order ?? "—"}</td>
            </tr>); })}
            {!Bx.length && <tr><td colSpan={6} className="muted">مفيش أطباق في المخزون</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
