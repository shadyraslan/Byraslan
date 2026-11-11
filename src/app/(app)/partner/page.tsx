import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { savePartner, addPartnerBranch, savePartnerBranch, addDiscount, reviewed } from "./actions";

type P = { id: number; name: string; phone: string | null; discount_pct: number; settle_cycle: string; due_days: number; unit: string; file_map: Record<string, string>; active: boolean };
const CY: Record<string, string> = { daily: "يومي", weekly: "أسبوعي", monthly: "شهري", manual: "يدوي" };

/** السوبر ماركت الشريك: الشركاء، فروعهم ومخازنهم الوهمية، الخصومات، شكل ملف الصبح، والأسعار اللي محتاجة مراجعة */
export default async function Partner({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; edit?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["partner.manage", "partner.upload", "partner.settle", "partner.dispatch"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: ps }, { data: pbs }, { data: locs }, { data: disc }, { data: fams }, { data: items }, { data: led }, { data: rev }, { data: ups }] = await Promise.all([
    sb.from("partners").select("*").order("id"),
    sb.from("partner_branches").select("*"),
    sb.from("locations").select("id,name,type").eq("active", true).order("sort"),
    sb.from("partner_discounts").select("*").order("id"),
    sb.from("families").select("id,name").order("sort"),
    sb.from("items").select("id,name").eq("active", true).order("name"),
    sb.from("partner_ledger").select("partner_id,amount"),
    sb.from("partner_items").select("partner_id,code,item_id,name,price,prev_price,cost").eq("review", true),
    sb.from("partner_uploads").select("id,location_id,status,at").order("id", { ascending: false }).limit(10),
  ]);
  const P = (ps ?? []) as P[];
  const LN = new Map((locs ?? []).map((l) => [l.id, l.name]));
  const FN = new Map((fams ?? []).map((f) => [f.id, f.name]));
  const IN = new Map((items ?? []).map((i) => [i.id, i.name]));
  const bal = (id: number) => (led ?? []).filter((l) => l.partner_id === id).reduce((a, l) => a + Number(l.amount), 0);
  const branches = (locs ?? []).filter((l) => l.type === "dark" || l.type === "shop");
  const cur = P.find((p) => String(p.id) === sp.edit);
  const man = can(me, "partner.manage");
  return (
    <>
      <div className="top"><h1>السوبر ماركت الشريك</h1>
        <div className="row">
          {can(me, "partner.upload") && <Link className="btn pri" href="/partner/upload" style={{ display: "inline-grid", placeItems: "center" }}>رفع ملف الصبح</Link>}
          {can(me, "partner.dispatch") && <Link className="btn" href="/partner/dispatch" style={{ display: "inline-grid", placeItems: "center" }}>الديسباتشر</Link>}
          {can(me, "partner.settle") && <Link className="btn" href="/partner/account" style={{ display: "inline-grid", placeItems: "center" }}>الحساب الجاري</Link>}
        </div>
      </div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}

      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الشريك</th><th>الخصم الافتراضي</th><th>التسوية</th><th>الرصيد</th><th>الفروع</th><th></th></tr></thead>
          <tbody>{P.map((p) => {
            const b = bal(p.id);
            return (
              <tr key={p.id}>
                <td><b>{p.name}</b>{p.phone && <div className="muted" dir="ltr">{p.phone}</div>}</td>
                <td className="num">{p.discount_pct}%</td><td>{CY[p.settle_cycle]} · استحقاق {p.due_days} يوم</td>
                <td className="num" style={{ color: b > 0 ? "var(--bad)" : undefined }}>{b > 0 ? `علينا ${money(b)}` : b < 0 ? `لينا ${money(-b)}` : "0"} ج</td>
                <td style={{ fontSize: 13 }}>{(pbs ?? []).filter((x) => x.partner_id === p.id).map((x) => (
                  <form key={x.location_id} action={savePartnerBranch} className="row" style={{ gap: 4, marginBottom: 4 }}>
                    <input type="hidden" name="loc" value={x.location_id} />
                    <b>{LN.get(x.location_id)}</b> ←
                    <select name="branch" defaultValue={x.branch_id ?? ""} disabled={!man}><option value="">مش مربوط</option>{branches.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                    <select name="near" defaultValue={x.near ? "near" : "far"} disabled={!man}><option value="near">قريب (كابتن واحد)</option><option value="far">بعيد</option></select>
                    {man && <button className="btn" style={{ height: 28 }}>حفظ</button>}
                  </form>
                ))}</td>
                <td>{man && <Link className="btn" href={`/partner?edit=${p.id}#pform`}>تعديل</Link>}</td>
              </tr>
            );
          })}
          {!P.length && <tr><td colSpan={6} className="muted">ضيف أول شريك من تحت</td></tr>}</tbody>
        </table>
      </div>

      {!!(rev ?? []).length && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>أسعار الشريك اتغيّرت — راجع سعر البيع</h2>
          <table><tbody>{(rev ?? []).map((r) => (
            <tr key={r.partner_id + r.code}><td>{IN.get(r.item_id ?? 0) ?? r.name}</td><td className="num">{money(Number(r.prev_price))} ← <b>{money(Number(r.price))}</b></td><td className="num">تكلفتنا {money(Number(r.cost))}</td>
              <td className="row" style={{ gap: 4 }}><Link className="btn" href="/prices">التسعير</Link><form action={reviewed}><input type="hidden" name="partner" value={r.partner_id} /><input type="hidden" name="code" value={r.code} /><button className="btn">اتراجع</button></form></td></tr>
          ))}</tbody></table>
        </div>
      )}

      {!!(ups ?? []).length && (
        <div className="card"><h2 style={{ marginTop: 0 }}>آخر رفعات</h2>
          <table><tbody>{(ups ?? []).map((u) => <tr key={u.id}><td><Link href={`/partner/upload/${u.id}`}>#{u.id}</Link></td><td>{LN.get(u.location_id)}</td><td>{u.status === "draft" ? "مسودة" : u.status === "approved" ? "اتعمدت" : "اتلغت"}</td><td className="muted">{new Date(u.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</td></tr>)}</tbody></table>
        </div>
      )}

      {man && (
        <>
          <form id="pform" action={savePartner} className="card" style={{ display: "grid", gap: 8 }} key={cur?.id ?? "new"}>
            <h2 style={{ margin: 0 }}>{cur ? `تعديل ${cur.name}` : "شريك جديد"}</h2>
            {cur && <input type="hidden" name="id" value={cur.id} />}
            <div className="row">
              <label className="fld" style={{ flex: 1 }}>الاسم<input name="name" required defaultValue={cur?.name ?? ""} /></label>
              <label className="fld">موبايل<input name="phone" dir="ltr" defaultValue={cur?.phone ?? ""} /></label>
              <label className="fld">خصم افتراضي %<input name="pct" inputMode="decimal" dir="ltr" defaultValue={cur?.discount_pct ?? 0} style={{ width: 80 }} /></label>
              <label className="fld">دورة التسوية<select name="cycle" defaultValue={cur?.settle_cycle ?? "weekly"}>{Object.entries(CY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="fld">الاستحقاق (يوم)<input name="due" type="number" defaultValue={cur?.due_days ?? 7} style={{ width: 70 }} /></label>
              <label className="fld">وحدة الكمية في الملف<select name="unit" defaultValue={cur?.unit ?? "piece"}><option value="piece">قطعة</option><option value="carton">كرتونة</option></select></label>
            </div>
            <b>شكل ملف الصبح — اسم العمود في الإكسل لكل معلومة</b>
            <div className="row">
              {[["m_code", "كود الصنف", "code"], ["m_barcode", "الباركود", "barcode"], ["m_name", "الاسم", "name"], ["m_qty", "الكمية", "qty"], ["m_price", "السعر", "price"]].map(([n, l, k]) => (
                <label key={n} className="fld">{l}<input name={n} defaultValue={cur?.file_map?.[k] ?? ""} placeholder={l} style={{ width: 120 }} /></label>
              ))}
            </div>
            <button className="btn pri" style={{ justifySelf: "start" }}>حفظ</button>
          </form>
          {!!P.length && (
            <div className="grid2">
              <form action={addPartnerBranch} className="card" style={{ display: "grid", gap: 8 }}>
                <b>فرع شريك جديد (بيعمل مخزن وهمي)</b>
                <select name="partner" required>{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <input name="name" required placeholder="اسم الفرع، مثلاً: كارفور رشدي" />
                <input name="city" placeholder="المدينة" />
                <select name="branch" defaultValue=""><option value="">مربوط بفرع روستوز…</option>{branches.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                <select name="near"><option value="near">قريب — كابتن واحد بيعدّي على الاتنين</option><option value="far">بعيد — مدير الحركة يقرر لكل طلب</option></select>
                <button className="btn pri">ضيف</button>
              </form>
              <div className="card">
                <b>نسب الخصم (الصنف يغلب القسم يغلب الافتراضي)</b>
                <table><tbody>{(disc ?? []).map((d) => <tr key={d.id}><td>{P.find((p) => p.id === d.partner_id)?.name}</td><td>{d.item_id ? IN.get(d.item_id) : d.family_id ? `قسم ${FN.get(d.family_id)}` : ""}</td><td className="num">{d.pct}%</td></tr>)}</tbody></table>
                <form action={addDiscount} className="row" style={{ gap: 4, marginTop: 6 }}>
                  <select name="partner">{P.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  <select name="family" defaultValue=""><option value="">قسم…</option>{(fams ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
                  <select name="item" defaultValue=""><option value="">أو صنف…</option>{(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                  <input name="pct" required inputMode="decimal" placeholder="%" style={{ width: 60 }} />
                  <button className="btn">ضيف</button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
