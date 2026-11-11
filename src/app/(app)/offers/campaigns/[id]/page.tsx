import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { saveCampaign, addItems, removeItem, campaignAct } from "../actions";
import CampaignForm, { type LabelColor } from "../CampaignForm";
import { LabelStyles, OfferLabel } from "@/components/ShelfLabel";

type It = { item_id: number; name: string; size: string | null; maker: string | null; unit: string; price: number; app_price: number | null; old: number | null; code: string | null };
type V = { campaign: { id: number; name: string; subtitle: string | null; color: string; starts_at: string; ends_at: string; status: string; locations: string[] | null; channels: string[]; note: string | null };
  loc: string; max_pct: number; items: It[]; branches: { loc: string; name: string; hung_at: string | null; removed_at: string | null }[] };
type Rp = { name: string; during_q: number; during_v: number; before_q: number; before_v: number; cost: number | null; price: number };
const ST: Record<string, string> = { draft: "مسودة", pending: "مستني اعتماد", approved: "متعمد — هيبدأ لوحده في ميعاده", live: "شغال دلوقتي", ended: "خلص — الأسعار رجعت", cancelled: "اتلغى" };
const d = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });

/** المهرجان: الأصناف بسعر قبل/بعد ← اعتماد ← ملف الملصقات ← الفروع تعلّق وتشيل ← التقرير */
export default async function Campaign({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getMe();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("campaign_view", { p_id: Number(id), p_loc: null });
  if (error || !data) notFound();
  const v = data as V, c = v.campaign;
  const editable = can(me, "promo.edit") && (c.status === "draft" || c.status === "pending");
  const [{ data: items }, { data: fams }, { data: locs }, rep, { data: cs }] = await Promise.all([
    editable ? sb.from("items").select("id,name").eq("active", true).order("name") : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    editable ? sb.from("families").select("id,name").order("sort") : Promise.resolve({ data: [] as { id: number; name: string }[] }),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    ["live", "ended"].includes(c.status) && (can(me, "promo.edit") || can(me, "promo.approve") || can(me, "acc.view")) ? sb.rpc("campaign_report", { p_id: c.id }) : Promise.resolve({ data: null }),
    sb.from("settings").select("value").eq("key", "campaigns.colors").maybeSingle(),
  ]);
  const pct = (it: It) => (it.old ? Math.round((1 - it.price / it.old) * 100) : null);
  const until = new Date(c.ends_at).toLocaleDateString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric" });
  const R = (rep.data ?? []) as Rp[];
  const A = ({ a, t, pri, note }: { a: string; t: string; pri?: boolean; note?: boolean }) => (
    <form action={campaignAct} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="a" value={a} />{note && <input name="note" placeholder="ملاحظة" style={{ width: 140 }} />}<button className={pri ? "btn pri" : "btn"}>{t}</button></form>
  );
  return (
    <>
      <LabelStyles />
      <div className="top"><h1 style={{ borderInlineStart: `6px solid ${c.color}`, paddingInlineStart: 10 }}>{c.name}</h1><Link className="btn" href="/offers/campaigns" style={{ display: "inline-grid", placeItems: "center" }}>→ كل المهرجانات</Link></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="kpis">
        <div className="kpi" style={{ borderColor: c.color }}><span>الحالة</span><b style={{ fontSize: 16 }}>{ST[c.status]}</b></div>
        <div className="kpi"><span>المدة</span><b style={{ fontSize: 15 }}>{d(c.starts_at)}</b><small>لحد {d(c.ends_at)}</small></div>
        <div className="kpi"><span>الأصناف</span><b className="num">{v.items.length}</b><small>أقصى خصم {v.max_pct}%</small></div>
        <div className="kpi"><span>القنوات</span><b style={{ fontSize: 15 }}>{c.channels.map((x) => (x === "direct" ? "الكاشير" : "التطبيق")).join(" + ")}</b></div>
      </div>

      <div className="card row" style={{ gap: 8 }}>
        {c.status === "draft" && can(me, "promo.edit") && <A a="submit" t="ابعت للاعتماد" pri />}
        {c.status === "pending" && can(me, "promo.approve") && <><A a="approve" t="✅ اعتمد" pri note /><A a="reject" t="رجّعه مسودة" note /></>}
        {["draft", "pending", "approved", "live"].includes(c.status) && (can(me, "promo.edit") || can(me, "promo.approve")) && <A a="cancel" t={c.status === "live" ? "وقّف العرض ورجّع الأسعار" : "إلغاء"} />}
        <a className="btn" href={`/print/campaign/${c.id}`} target="_blank" rel="noreferrer">🖨 ملف ملصقات العرض</a>
        {c.note && <span className="muted">ملاحظة: {c.note}</span>}
      </div>

      {!!v.branches.length && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>الفروع والملصقات</h2>
          <table><tbody>{v.branches.map((b) => (
            <tr key={b.loc}><td><b>{b.name}</b></td>
              <td>{b.hung_at ? `✅ اتعلّقت ${d(b.hung_at)}` : "⏳ لسه ماتعلّقتش"}</td>
              <td>{b.removed_at ? `اتشالت ${d(b.removed_at)}` : c.status === "ended" || c.status === "cancelled" ? <b style={{ color: "var(--bad)" }}>شيل الملصقات</b> : ""}</td>
              <td>{(can(me, "labels.hang") || can(me, "pos.shift") || can(me, "promo.edit")) && (
                !b.hung_at && ["approved", "live"].includes(c.status) ? <form action={campaignAct}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="loc" value={b.loc} /><input type="hidden" name="a" value="hung" /><button className="btn">علّقت</button></form>
                : b.hung_at && !b.removed_at && ["ended", "cancelled"].includes(c.status) ? <form action={campaignAct}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="loc" value={b.loc} /><input type="hidden" name="a" value="removed" /><button className="btn">شيلت</button></form> : null)}</td>
            </tr>
          ))}</tbody></table>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h2 style={{ marginTop: 0 }}>الأصناف</h2>
        <table>
          <thead><tr><th>الصنف</th><th>السعر الحالي</th><th>سعر العرض</th><th>التطبيق</th><th>الخصم</th><th></th></tr></thead>
          <tbody>{v.items.map((it) => (
            <tr key={it.item_id}><td><b>{it.name}</b> <span className="muted">{[it.maker, it.size].filter(Boolean).join(" · ")}</span></td>
              <td className="num">{it.old != null ? money(Number(it.old)) : "—"}</td><td className="num"><b style={{ color: c.color }}>{money(Number(it.price))}</b></td>
              <td className="num">{it.app_price != null ? money(Number(it.app_price)) : "نفسه"}</td><td className="num">{pct(it) != null ? `${pct(it)}%` : ""}</td>
              <td>{editable && <form action={removeItem}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="item" value={it.item_id} /><button className="btn" style={{ height: 30 }}>شيل</button></form>}</td></tr>
          ))}{!v.items.length && <tr><td colSpan={6} className="muted">ضيف أصناف من تحت</td></tr>}</tbody>
        </table>
        {editable && (
          <>
            <form action={addItems} className="row" style={{ gap: 6, marginTop: 10, alignItems: "end" }}>
              <input type="hidden" name="id" value={c.id} />
              <label className="fld" style={{ flex: 2 }}>صنف<select name="item" defaultValue=""><option value="">اختار…</option>{(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>
              <label className="fld">سعر العرض<input name="price" inputMode="decimal" dir="ltr" style={{ width: 90 }} /></label>
              <label className="fld">سعر التطبيق (لو مختلف)<input name="app" inputMode="decimal" dir="ltr" style={{ width: 90 }} /></label>
              <button className="btn pri">ضيف</button>
            </form>
            <form action={addItems} className="row" style={{ gap: 6, marginTop: 8, alignItems: "end" }}>
              <input type="hidden" name="id" value={c.id} />
              <label className="fld" style={{ flex: 2 }}>أو قسم كامل<select name="fam" defaultValue=""><option value="">اختار القسم…</option>{(fams ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
              <label className="fld">خصم %<input name="pct" inputMode="decimal" dir="ltr" style={{ width: 70 }} /></label>
              <button className="btn">ضيف القسم</button>
            </form>
          </>
        )}
      </div>

      {!!v.items.length && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>شكل الملصق</h2>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {v.items.slice(0, 2).map((it) => <OfferLabel key={it.item_id} d={{ ...it, price: Number(it.price), old: it.old != null ? Number(it.old) : null }} offer={{ name: c.name, color: c.color, until }} />)}
          </div>
        </div>
      )}

      {!!R.length && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>المبيعات أثناء العرض مقارنة بنفس المدة قبله</h2>
          <table><thead><tr><th>الصنف</th><th>قبل (كمية / قيمة)</th><th>أثناء (كمية / قيمة)</th><th>الزيادة</th><th>هامش العرض</th></tr></thead>
            <tbody>{R.map((r) => (
              <tr key={r.name}><td>{r.name}</td><td className="num">{r.before_q} / {money(r.before_v)}</td><td className="num"><b>{r.during_q} / {money(r.during_v)}</b></td>
                <td className="num">{r.before_q ? `${Math.round((r.during_q / r.before_q - 1) * 100)}%` : "—"}</td>
                <td className="num" style={{ color: r.cost != null && r.cost > r.price ? "var(--bad)" : undefined }}>{r.cost != null ? `${money(r.price - r.cost)} ج` : "التكلفة مش متسجّلة"}</td></tr>
            ))}</tbody></table>
        </div>
      )}
      {editable && <CampaignForm action={saveCampaign} locs={locs ?? []} c={c} colors={(Array.isArray(cs?.value) ? cs.value : []) as LabelColor[]} />}
    </>
  );
}
