import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { savePromo, togglePromo, saveOffer } from "./actions";

type P = { id: number; name: string; kind: string; value: number; max_off: number | null; auto: boolean; code: string | null; min_order: number; starts_at: string | null; ends_at: string | null;
  max_uses: number | null; max_per_customer: number | null; channels: string[]; locations: string[] | null; families: number[] | null; stackable: boolean; first_order: boolean; active: boolean; note: string | null };
type O = { id: number; kind: string; title: string | null; subtitle: string | null; badge: string | null; cta: string | null; icon: string | null; bg: string | null; target_family: string | null; item_id: number | null; pct: number | null; active: boolean; sort: number; starts_at: string | null; ends_at: string | null };
const CH: [string, string][] = [["app", "التطبيق"], ["web", "الويب"], ["phone", "تليفون"], ["whatsapp", "واتساب"], ["direct", "الكاشير"]];
const local = (s: string | null) => (s ? new Date(s).toLocaleString("sv-SE", { timeZone: "Africa/Cairo" }).slice(0, 16).replace(" ", "T") : "");
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric" }) : "");

/** العروض والبروموكود (كل القنوات) + بانرات وعروض أصناف التطبيق + جرّب على فاتورة */
export default async function Offers({ searchParams }: { searchParams: Promise<{ edit?: string; oedit?: string; ok?: string; err?: string; t_ch?: string; t_loc?: string; t_amt?: string; t_code?: string; t_phone?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "promo.edit") && !can(me, "prices.edit")) redirect("/dashboard");
  const edit = can(me, "promo.edit");
  const sb = await supabaseServer();
  const [{ data: ps }, { data: uses }, { data: offers }, { data: locs }, { data: fams }, { data: items }] = await Promise.all([
    sb.from("promos").select("*").order("active", { ascending: false }).order("id", { ascending: false }),
    sb.from("promo_uses").select("promo_id,amount"),
    sb.from("app_offers").select("*").order("kind").order("sort"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["branch", "darkstore", "store", "direct", "shop"]).order("sort"),
    sb.from("families").select("id,name").order("sort"),
    sb.from("items").select("id,name").eq("active", true).order("name"),
  ]);
  const P = (ps ?? []) as P[];
  const U = new Map<number, { n: number; v: number }>();
  for (const u of uses ?? []) { const x = U.get(u.promo_id) ?? { n: 0, v: 0 }; x.n++; x.v += Number(u.amount); U.set(u.promo_id, x); }
  const allLocs = locs?.length ? locs : ((await sb.from("locations").select("id,name").eq("active", true).neq("type", "section").order("sort")).data ?? []);
  const LN = new Map(allLocs.map((l) => [l.id, l.name]));
  const FN = new Map((fams ?? []).map((f) => [f.id, f.name]));
  const IN = new Map((items ?? []).map((i) => [i.id, i.name]));
  const cur = P.find((p) => String(p.id) === sp.edit);
  const ocur = ((offers ?? []) as O[]).find((o) => String(o.id) === sp.oedit);
  const now = Date.now();
  const state = (p: P) => !p.active ? "موقوف" : p.starts_at && new Date(p.starts_at).getTime() > now ? "لسه هيبدأ" : p.ends_at && new Date(p.ends_at).getTime() < now ? "خلص" : "شغال";

  // جرّب على فاتورة
  type Test = { discount: number; applied: { name: string; amount: number }[]; code_msg: string | null };
  let test: Test | null = null;
  if (sp.t_amt) {
    const { data } = await sb.rpc("promo_eval", { p_channel: sp.t_ch || "app", p_loc: sp.t_loc || null, p_phone: sp.t_phone || null, p_lines: [{ item_id: 0, qty: 1, unit_price: Number(sp.t_amt) }], p_code: sp.t_code || null });
    test = data as Test;
  }

  return (
    <>
      <div className="top"><h1>العروض والبروموكود</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>العروض على الفاتورة</h2>
        <table>
          <thead><tr><th>العرض</th><th>الخصم</th><th>إزاي</th><th>فين</th><th>المدة</th><th>اتستخدم</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {P.map((p) => {
              const u = U.get(p.id);
              return (
                <tr key={p.id} style={{ opacity: p.active ? 1 : 0.55 }}>
                  <td><b>{p.name}</b>{p.note && <div className="muted" style={{ fontSize: 12 }}>{p.note}</div>}</td>
                  <td>{p.kind === "pct" ? `${p.value}%` : `${money(p.value)} ج`}{p.max_off ? ` (أقصى ${money(p.max_off)})` : ""}{p.min_order ? <div className="muted" style={{ fontSize: 12 }}>من {money(p.min_order)} ج</div> : null}</td>
                  <td>{p.auto ? "تلقائي" : <b dir="ltr">{p.code}</b>}{p.stackable ? <div className="muted" style={{ fontSize: 12 }}>بيتجمع</div> : null}{p.first_order ? <div className="muted" style={{ fontSize: 12 }}>أول طلب</div> : null}</td>
                  <td style={{ fontSize: 13 }}>{p.channels.map((c) => CH.find((x) => x[0] === c)?.[1] ?? c).join("، ")}
                    <div className="muted" style={{ fontSize: 12 }}>{p.locations?.length ? p.locations.map((l) => LN.get(l) ?? l).join("، ") : "كل الفروع"}{p.families?.length ? ` · ${p.families.map((f) => FN.get(f)).join("، ")}` : ""}</div></td>
                  <td className="muted" style={{ fontSize: 13 }}>{p.starts_at || p.ends_at ? `${d(p.starts_at) || "من دلوقتي"} ← ${d(p.ends_at) || "مفتوح"}` : "مفتوح"}</td>
                  <td className="num">{u?.n ?? 0}{p.max_uses ? `/${p.max_uses}` : ""}<div className="muted" style={{ fontSize: 12 }}>{money(u?.v ?? 0)} ج</div></td>
                  <td><span className="pill">{state(p)}</span></td>
                  <td>{edit && <div className="row" style={{ gap: 4 }}>
                    <Link className="btn" href={`/offers?edit=${p.id}#form`}>تعديل</Link>
                    <form action={togglePromo}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="on" value={p.active ? "0" : "1"} /><button className="btn">{p.active ? "وقّف" : "شغّل"}</button></form>
                  </div>}</td>
                </tr>
              );
            })}
            {!P.length && <tr><td colSpan={8} className="muted">مفيش عروض لسه</td></tr>}
          </tbody>
        </table>
        <div className="note">لو أكتر من عرض انطبق: الأكبر بس، والمتعلّم "بيتجمع" بيتضاف عليه. العروض بتشتغل في التطبيق والويب وطلبات التليفون والواتساب والكاشير حسب القنوات المختارة.</div>
      </div>

      {edit && (
        <form id="form" action={savePromo} className="card" style={{ display: "grid", gap: 8 }} key={cur?.id ?? "new"}>
          <h2 style={{ margin: 0 }}>{cur ? `تعديل: ${cur.name}` : "عرض أو بروموكود جديد"}</h2>
          {cur && <input type="hidden" name="id" value={cur.id} />}
          <div className="row">
            <label className="fld" style={{ flex: 2 }}>الاسم<input name="name" required defaultValue={cur?.name ?? ""} placeholder="خصم الافتتاح، عرض الويك إند…" /></label>
            <label className="fld">النوع<select name="kind" defaultValue={cur?.kind ?? "pct"}><option value="pct">نسبة %</option><option value="fixed">مبلغ ثابت</option></select></label>
            <label className="fld">القيمة<input name="value" required inputMode="decimal" dir="ltr" defaultValue={cur?.value ?? ""} style={{ width: 90 }} /></label>
            <label className="fld">أقصى خصم (ج)<input name="max_off" inputMode="decimal" dir="ltr" defaultValue={cur?.max_off ?? ""} style={{ width: 90 }} /></label>
            <label className="fld">أقل فاتورة (ج)<input name="min_order" inputMode="decimal" dir="ltr" defaultValue={cur?.min_order ?? 0} style={{ width: 90 }} /></label>
          </div>
          <div className="row">
            <label className="fld">بيتطبّق<select name="mode" defaultValue={cur ? (cur.auto ? "auto" : "code") : "code"}><option value="code">ببروموكود</option><option value="auto">تلقائي على كل فاتورة</option></select></label>
            <label className="fld">الكود (فاضي = يتعمل لوحده)<input name="code" dir="ltr" defaultValue={cur?.code ?? ""} style={{ textTransform: "uppercase", width: 130 }} /></label>
            <label className="fld">من<input type="datetime-local" name="starts" defaultValue={local(cur?.starts_at ?? null)} /></label>
            <label className="fld">لحد<input type="datetime-local" name="ends" defaultValue={local(cur?.ends_at ?? null)} /></label>
            <label className="fld">عدد مرات كلي<input name="max_uses" inputMode="numeric" dir="ltr" defaultValue={cur?.max_uses ?? ""} style={{ width: 80 }} /></label>
            <label className="fld">لكل عميل<input name="max_per" inputMode="numeric" dir="ltr" defaultValue={cur?.max_per_customer ?? ""} style={{ width: 80 }} /></label>
          </div>
          <div><b>القنوات: </b>{CH.map(([k, l]) => <label key={k} style={{ marginInlineEnd: 12 }}><input type="checkbox" name="ch" value={k} defaultChecked={cur ? cur.channels.includes(k) : k !== "direct"} /> {l}</label>)}</div>
          <details open={!!cur?.locations?.length}><summary><b>الفروع</b> (من غير اختيار = كل الفروع)</summary>
            {allLocs.map((l) => <label key={l.id} style={{ marginInlineEnd: 12 }}><input type="checkbox" name="loc" value={l.id} defaultChecked={!!cur?.locations?.includes(l.id)} /> {l.name}</label>)}
          </details>
          <details open={!!cur?.families?.length}><summary><b>الأقسام</b> (من غير اختيار = الفاتورة كلها)</summary>
            {(fams ?? []).map((f) => <label key={f.id} style={{ marginInlineEnd: 12 }}><input type="checkbox" name="fam" value={f.id} defaultChecked={!!cur?.families?.includes(f.id)} /> {f.name}</label>)}
          </details>
          <div className="row">
            <label><input type="checkbox" name="stack" defaultChecked={cur?.stackable} /> بيتجمع مع العروض التانية</label>
            <label><input type="checkbox" name="first" defaultChecked={cur?.first_order} /> لأول طلب بس (أونلاين)</label>
          </div>
          <label className="fld">ملاحظة<input name="note" defaultValue={cur?.note ?? ""} /></label>
          <div className="row"><button className="btn pri">حفظ</button>{cur && <Link className="btn" href="/offers">عرض جديد</Link>}</div>
        </form>
      )}

      <form className="card row" style={{ alignItems: "end" }}>
        <b style={{ width: "100%" }}>جرّب على فاتورة — أنهي خصم هيتطبّق؟</b>
        <label className="fld">القناة<select name="t_ch" defaultValue={sp.t_ch ?? "app"}>{CH.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="fld">الفرع<select name="t_loc" defaultValue={sp.t_loc ?? ""}><option value="">—</option>{allLocs.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="fld">قيمة الفاتورة<input name="t_amt" inputMode="decimal" dir="ltr" required defaultValue={sp.t_amt ?? ""} style={{ width: 100 }} /></label>
        <label className="fld">موبايل العميل<input name="t_phone" dir="ltr" defaultValue={sp.t_phone ?? ""} style={{ width: 130 }} /></label>
        <label className="fld">كود<input name="t_code" dir="ltr" defaultValue={sp.t_code ?? ""} style={{ width: 100 }} /></label>
        <button className="btn">جرّب</button>
        {test && <div style={{ width: "100%" }}>
          <b>الخصم: {money(Number(test.discount))} ج</b> {test.applied.map((a, i) => <span key={i} className="pill" style={{ marginInlineStart: 6 }}>{a.name}: {money(Number(a.amount))}</span>)}
          {test.code_msg && <div className="muted">{test.code_msg}</div>}
        </div>}
      </form>

      <div id="app" className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>بانرات وعروض أصناف التطبيق</h2>
        <table>
          <thead><tr><th>النوع</th><th>العنوان / الصنف</th><th>المدة</th><th>الترتيب</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {((offers ?? []) as O[]).map((o) => (
              <tr key={o.id} style={{ opacity: o.active ? 1 : 0.55 }}>
                <td>{o.kind === "banner" ? "بانر" : "خصم صنف"}</td>
                <td>{o.icon} <b>{o.kind === "item" ? `${IN.get(o.item_id ?? 0) ?? ""} — ${o.pct}%` : o.title}</b>{o.subtitle && <div className="muted" style={{ fontSize: 12 }}>{o.subtitle}</div>}</td>
                <td className="muted" style={{ fontSize: 13 }}>{o.starts_at || o.ends_at ? `${d(o.starts_at) || "دلوقتي"} ← ${d(o.ends_at) || "مفتوح"}` : "مفتوح"}</td>
                <td className="num">{o.sort}</td>
                <td>{o.active ? "شغال" : "موقوف"}</td>
                <td>{edit && <Link className="btn" href={`/offers?oedit=${o.id}#oform`}>تعديل</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <form id="oform" action={saveOffer} className="card" style={{ display: "grid", gap: 8 }} key={ocur?.id ?? "onew"}>
          <h2 style={{ margin: 0 }}>{ocur ? "تعديل بانر/عرض" : "بانر أو خصم صنف جديد"}</h2>
          {ocur && <input type="hidden" name="id" value={ocur.id} />}
          <div className="row">
            <label className="fld">النوع<select name="kind" defaultValue={ocur?.kind ?? "banner"}><option value="banner">بانر</option><option value="item">خصم على صنف</option></select></label>
            <label className="fld" style={{ flex: 1 }}>العنوان<input name="title" defaultValue={ocur?.title ?? ""} /></label>
            <label className="fld" style={{ flex: 1 }}>تحت العنوان<input name="subtitle" defaultValue={ocur?.subtitle ?? ""} /></label>
            <label className="fld">شارة<input name="badge" defaultValue={ocur?.badge ?? ""} style={{ width: 90 }} /></label>
          </div>
          <div className="row">
            <label className="fld">الزرار<input name="cta" defaultValue={ocur?.cta ?? ""} style={{ width: 110 }} /></label>
            <label className="fld">أيقونة<input name="icon" defaultValue={ocur?.icon ?? ""} style={{ width: 60 }} /></label>
            <label className="fld">لون الخلفية<input name="bg" dir="ltr" defaultValue={ocur?.bg ?? "#FFF5D6"} style={{ width: 100 }} /></label>
            <label className="fld">يفتح قسم<select name="family" defaultValue={ocur?.target_family ?? ""}><option value="">—</option>{(fams ?? []).map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}</select></label>
            <label className="fld">الصنف (لخصم الصنف)<select name="item" defaultValue={ocur?.item_id ?? ""}><option value="">—</option>{(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
            <label className="fld">النسبة %<input name="pct" inputMode="decimal" dir="ltr" defaultValue={ocur?.pct ?? ""} style={{ width: 70 }} /></label>
          </div>
          <div className="row">
            <label className="fld">من<input type="datetime-local" name="starts" defaultValue={local(ocur?.starts_at ?? null)} /></label>
            <label className="fld">لحد<input type="datetime-local" name="ends" defaultValue={local(ocur?.ends_at ?? null)} /></label>
            <label className="fld">الترتيب<input name="sort" inputMode="numeric" dir="ltr" defaultValue={ocur?.sort ?? 0} style={{ width: 70 }} /></label>
            <label><input type="checkbox" name="active" defaultChecked={ocur ? ocur.active : true} /> شغال</label>
          </div>
          <div className="row"><button className="btn pri">حفظ</button>{ocur && <Link className="btn" href="/offers#oform">جديد</Link>}</div>
        </form>
      )}
    </>
  );
}
