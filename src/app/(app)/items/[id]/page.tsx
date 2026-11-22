import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveMins } from "./actions";
import Photo from "./Photo";

type S = { location_id: string; qty: number; boxes: number };
type B = { sn: number; weight: number; status: string; loc: string; loc_name: string | null; packed_at: string; expires_at: string | null; prod_order: string | null; crate: string | null; last_kind: string | null; last_at: string | null; last_by: string | null; last_loc: string | null; moves: number | null };
const BST: Record<string, string> = { stock: "في المخزون", transit: "في تحويل", loaded: "على عربية", sold: "اتباع", waste: "هالك", donated: "تبرعات", missing: "ناقص — بيتحقق" };
const BK: Record<string, string> = { pack: "اتغلّف", transfer: "تحويل", sale: "بيع", waste: "هالك", donate: "تبرعات", adjust: "تعديل", count: "جرد", return: "مرتجع", receive: "استلام", production: "إنتاج", handover: "تسليم" };
const KIND: Record<string, string> = { product: "منتج نهائي", semi: "نص مصنع", raw: "خامة", mix: "خلطة", pack: "تغليف" };
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** الصنف: المخزون في كل مكان، أرقام الأطباق (العلب) بالوزن والصلاحية، والحد الأدنى — عشان الجرد والتحويلات والهالك */
export default async function Item({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string; loc?: string; st?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getMe();
  if (!["stock.view", "items.edit", "prod.orders"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const iid = Number(id);
  const { data: it } = await sb.from("items").select("id,name,unit,kind,arm,photo,code,shelf_days,scale_plu,sold_by").eq("id", iid).maybeSingle();
  const buy = !!it && (["raw", "mix", "pack", "semi"].includes(it.kind as string) || it.arm === "market");
  if (!it) notFound();
  const [{ data: st }, { data: bx }, { data: locs }, { data: mins }, { data: bcs }] = await Promise.all([
    sb.from("stock_by_location").select("location_id,qty,boxes").eq("item_id", iid),
    sb.rpc("item_boxes", { p_item: iid, p_loc: sp.loc || null, p_status: sp.st || "live" }),
    sb.from("locations").select("id,name,type").eq("active", true).neq("type", "section").order("sort"),
    sb.from("stock_min").select("location_id,min_qty,make_qty").eq("item_id", iid),
    sb.from("item_barcodes").select("code").eq("item_id", iid),
  ]);
  const S = (st ?? []) as S[];
  const Bx = (bx ?? []) as B[];
  const inStock = Bx.filter((b) => b.status === "stock").length;
  const L = (locs ?? []).filter((l) => !["factory", "donation", "waste"].includes(l.type as string) || S.some((x) => x.location_id === l.id));
  const noMin = (t: string) => ["factory", "donation", "waste"].includes(t);
  const LN = new Map(L.map((l) => [l.id as string, l.name as string]));
  const M = new Map<string, number>((mins ?? []).map((m) => [m.location_id as string, Number(m.min_qty)]));
  const MK = new Map<string, number>((mins ?? []).map((m) => [m.location_id as string, Number(m.make_qty ?? 0)]));
  const now = Date.now();
  const days = (s: string | null) => (s ? Math.floor((new Date(s).getTime() - now) / 864e5) : null);
  const total = S.reduce((a, s) => a + Number(s.qty), 0);
  return (
    <>
      <div className="top"><h1>{it.name}</h1>{(can(me, "acc.view") || can(me, "acc.pnl")) && <Link className="btn" href={`/statistics/items?item=${iid}`} style={{ display: "inline-grid", placeItems: "center" }}>📈 منحنى السنة ونصيبه</Link>}<Link className="btn" href="/items" style={{ display: "inline-grid", placeItems: "center" }}>→ الأصناف</Link></div>
      {sp.ok && <div className="okmsg">اتحفظ</div>}
      {sp.err && <div className="badmsg">{sp.err}</div>}
      <div className="card row" style={{ gap: 18, alignItems: "center" }}>
        {can(me, "items.edit") ? <Photo item={iid} photo={it.photo as string | null} code={String((bcs ?? [])[0]?.code ?? it.code ?? it.id)} /> : it.photo ? <img src={it.photo as string} alt="" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 12 }} /> : null}
        <div><div className="muted">النوع</div><b>{KIND[it.kind as string] ?? it.kind}{it.arm === "market" ? " · سوبر ماركت" : ""}</b></div>
        <div><div className="muted">الرصيد كله</div><b className="num">{r3(total)} {it.unit}</b></div>
        <div><div className="muted">أطباق في المخزون</div><b className="num">{inStock}</b></div>
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
          <thead><tr><th>المكان</th><th>أطباق</th><th>الرصيد</th><th>الحد الأدنى</th><th>{buy ? "كمية الطلب من المورد لما يوصل للحد" : "كمية الإنتاج لما يوصل للحد"}</th><th></th></tr></thead>
          <tbody>{L.map((l) => {
            const s = S.find((x) => x.location_id === l.id); const q = Number(s?.qty ?? 0); const mn = M.get(l.id as string) ?? 0; const mk = MK.get(l.id as string) ?? 0;
            const nm = noMin(l.type as string);
            if (!s && !mn && (!can(me, "stock.min") || nm)) return null;
            return (
              <tr key={l.id} style={{ color: mn > 0 && q < mn ? "var(--bad)" : undefined }}>
                <td><b>{l.name}</b></td>
                <td className="num" style={{ fontSize: 17 }}>{s?.boxes ? <Link href={`/items/${iid}?loc=${l.id}`}><b>{s.boxes}</b> طبق</Link> : "—"}</td>
                <td className="num">{r3(q)} {it.unit}</td>
                <td>{nm ? <span className="muted">—</span> : can(me, "stock.min") ? <input name={`min:${l.id}`} defaultValue={mn || ""} inputMode="decimal" dir="ltr" style={{ width: 90, height: 32 }} /> : <span className="num">{mn || "—"}</span>}</td>
                <td>{nm ? <span className="muted">—</span> : can(me, "stock.min") ? <input name={`make:${l.id}`} defaultValue={mk || ""} inputMode="decimal" dir="ltr" placeholder="مثلاً 10" style={{ width: 100, height: 32 }} /> : <span className="num">{mk || "—"}</span>}</td>
                <td>{mn > 0 && q < mn ? `ناقص ${r3(mn - q)}` : ""}</td>
              </tr>);
          })}</tbody>
        </table>
        {can(me, "stock.min") && <button className="btn pri" style={{ marginTop: 8 }}>احفظ الحد الأدنى</button>}
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{buy ? "لو الرصيد وصل للحد الأدنى في أي مكان، السيستم بيعمل أمر شراء أوتوماتيك للمورد الأول بالكمية دي، توصيل للمكان ده (لو مفيش أمر مفتوح للصنف هناك)." : "لو الرصيد وصل للحد الأدنى في أي مكان وليه «كمية إنتاج»، السيستم بيعمل أمر إنتاج أوتوماتيك بالكمية دي (لو مفيش أمر شغال للصنف)."} الهالك والمصنع والتبرعات مالهمش حد أدنى.</div>
      </form>
      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 style={{ margin: 0 }}>الأطباق {sp.loc ? `— ${LN.get(sp.loc) ?? sp.loc}` : ""} ({Bx.length})</h2>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {([["live", "الموجودة"], ["stock", "في المخزون"], ["loaded", "على عربية"], ["missing", "ناقصة"], ["sold", "اتباعت"], ["waste", "هالك"], ["all", "الكل"]] as const).map(([k, t]) => (
              <Link key={k} className={`btn${(sp.st || "live") === k ? " pri" : ""}`} href={`/items/${iid}?${new URLSearchParams({ ...(sp.loc ? { loc: sp.loc } : {}), st: k }).toString()}`} style={{ height: 32 }}>{t}</Link>))}
            {sp.loc && <Link href={`/items/${iid}${sp.st ? `?st=${sp.st}` : ""}`} className="btn" style={{ height: 32 }}>كل الأماكن</Link>}
          </div>
        </div>
        <table style={{ marginTop: 6 }}>
          <thead><tr><th>رقم الطبق</th><th>الوزن</th><th>الحالة</th><th>المكان</th><th>الصلاحية</th><th>آخر تغيير</th><th>أمر الإنتاج</th></tr></thead>
          <tbody>{Bx.map((b) => { const d = days(b.expires_at); const live = ["stock", "loaded", "transit"].includes(b.status); return (
            <tr key={b.sn} style={{ color: live && d != null && d < 0 ? "var(--bad)" : live && d != null && d < 1 ? "#b7791f" : undefined }}>
              <td className="num"><Link href={`/boxes?sn=${b.sn}`}><b>#{b.sn}</b></Link></td>
              <td className="num">{b.weight} {it.unit}</td>
              <td><span className="pill" style={b.status === "missing" ? { color: "var(--bad)", borderColor: "var(--bad)" } : b.status === "stock" ? { color: "var(--good)" } : {}}>{BST[b.status] ?? b.status}</span></td>
              <td>{b.loc_name ?? b.loc}{b.crate ? ` · قفص ${b.crate}` : ""}</td>
              <td>{b.expires_at ? `${new Date(b.expires_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}${live ? (d! < 0 ? " · خلصت" : d === 0 ? " · النهارده" : ` · فاضل ${d} يوم`) : ""}` : "—"}</td>
              <td style={{ fontSize: 12.5 }}>{b.last_kind ? <><b>{BK[b.last_kind] ?? b.last_kind}</b>{b.last_loc ? ` · ${b.last_loc}` : ""}<div className="muted">{new Date(b.last_at!).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}{b.last_by ? ` · ${b.last_by}` : ""}{b.moves && b.moves > 1 ? ` · ${b.moves} حركة` : ""}</div></> : "—"}</td>
              <td className="num">{b.prod_order ?? "—"}</td>
            </tr>); })}
            {!Bx.length && <tr><td colSpan={7} className="muted">مفيش أطباق بالحالة دي</td></tr>}
          </tbody>
        </table>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>دوس على رقم الطبق تشوف كل حركة حصلت عليه من ساعة ما اتغلّف.</div>
      </div>
    </>
  );
}
