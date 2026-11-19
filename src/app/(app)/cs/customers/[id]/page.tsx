import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { editCustomer, saveAddress, removeAddress } from "../../actions";
import CustMoney from "./CustMoney";

type A = { id: number; label: string | null; address: string; floor: string | null; apt: string | null; landmark: string | null; district_id: number | null; is_default: boolean };
type O = { no: number; token: string; status: string; created_at: string; total: number | null; est_total: number | null };
const ST: Record<string, string> = { new: "جديد", accepted: "اتقبل", preparing: "بيتجهز", ready: "جاهز", out: "مع الطيار", delivered: "اتسلّم", cancelled: "اتلغى", booked: "حجز" };
const TIER: Record<string, string> = { regular: "عادي", vip: "VIP", company: "شركة", staff: "موظف" };

/** بيانات العميل كاملة: تعديل الاسم والملاحظات والشركة، وكل عناوينه بخاناتها (الشارع، الدور، الشقة، العلامة) */
export default async function Customer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "cs.agent") && !can(me, "orders.handle")) redirect("/dashboard");
  const sb = await supabaseServer();
  const cid = Number(id);
  const { data: c } = await sb.from("customers").select("id,phone,name,notes,company,tax_no,tier,created_at,auth_id").eq("id", cid).maybeSingle();
  if (!c) notFound();
  const [{ data: addrs }, { data: dists }, { data: orders }, pts, cr, bal, { data: bmoves }] = await Promise.all([
    sb.from("customer_addresses").select("id,label,address,floor,apt,landmark,district_id,is_default").eq("customer_id", cid).eq("active", true).order("is_default", { ascending: false }).order("id", { ascending: false }),
    sb.from("districts").select("id,name,city").eq("active", true).order("city").order("name"),
    sb.from("online_orders").select("no,token,status,created_at,total,est_total").eq("customer_id", cid).order("created_at", { ascending: false }).limit(10),
    sb.rpc("points_balance", { p_cust: cid }),
    sb.rpc("credit_state", { p_cust: cid }),
    sb.rpc("cust_balance_of", { p_cust: cid }),
    sb.from("cust_balance").select("kind,amount,method,note,at").eq("customer_id", cid).order("at", { ascending: false }).limit(30),
  ]);
  const A = (addrs ?? []) as A[];
  const D = dists ?? [];
  const credit = cr.data as { active?: boolean; balance?: number; limit?: number; overdue?: number } | null;
  const addrForm = (a?: A) => (
    <form action={saveAddress} style={{ display: "grid", gap: 8 }}>
      <input type="hidden" name="customer" value={cid} />{a && <input type="hidden" name="aid" value={a.id} />}
      <div className="row">
        <label className="fld">اسم العنوان<input name="label" defaultValue={a?.label ?? ""} placeholder="البيت / الشغل" style={{ width: 130 }} /></label>
        <label className="fld" style={{ flex: 1 }}>المنطقة<select name="district" required defaultValue={a?.district_id ?? ""}><option value="" disabled>اختار</option>{D.map((d) => <option key={d.id} value={d.id}>{d.city} — {d.name}</option>)}</select></label>
      </div>
      <label className="fld">العنوان (الشارع ورقم العمارة)<input name="address" required defaultValue={a?.address ?? ""} /></label>
      <div className="row">
        <label className="fld">الدور<input name="floor" defaultValue={a?.floor ?? ""} style={{ width: 90 }} /></label>
        <label className="fld">الشقة<input name="apt" defaultValue={a?.apt ?? ""} style={{ width: 90 }} /></label>
        <label className="fld" style={{ flex: 1 }}>علامة مميزة<input name="landmark" defaultValue={a?.landmark ?? ""} placeholder="جنب إيه / قصاد إيه" /></label>
      </div>
      <label className="row" style={{ gap: 6 }}><input type="checkbox" name="default" value="1" defaultChecked={a?.is_default} /> العنوان الأساسي</label>
      <button className="btn pri" style={{ justifySelf: "start" }}>{a ? "احفظ التعديل" : "ضيف العنوان"}</button>
    </form>
  );
  return (
    <>
      <div className="top"><h1>{c.name || "عميل"}</h1><Link className="btn" href={`/cs/customers?q=${c.phone}`} style={{ display: "inline-grid", placeItems: "center" }}>→ العملاء</Link></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">اتحفظ</div>}
      <div className="card row" style={{ gap: 18 }}>
        <div><div className="muted">الموبايل</div><b dir="ltr">{c.phone}</b></div>
        <div><div className="muted">الفئة</div><b>{TIER[c.tier as string] ?? c.tier ?? "عادي"}</b></div>
        <div><div className="muted">النقاط</div><b>{Number(pts.data ?? 0)}</b></div>
        <div><div className="muted">الآجل</div><b>{credit?.active ? `${Math.round(Number(credit.balance ?? 0))} ج من ${Math.round(Number(credit.limit ?? 0))}${Number(credit.overdue) > 0 ? ` (متأخر ${Math.round(Number(credit.overdue))})` : ""}` : "مالوش حساب"}</b></div>
        <div><div className="muted">التطبيق</div><b>{c.auth_id ? "متسجّل" : "لأ"}</b></div>
        <div className="row" style={{ gap: 6, marginInlineStart: "auto" }}>
          <Link className="btn pri" href={`/cs/new?phone=${c.phone}`}>+ طلب / حجز</Link>
          <Link className="btn" href={`/cs/orders?scope=all&q=${c.phone}`}>طلباته</Link>
          <Link className="btn" href={`/accounts/ledger?t=customer&id=${c.id}`}>كارته</Link>
        </div>
      </div>
      <CustMoney id={cid} balance={Number(bal.data ?? 0)} moves={((bmoves ?? []) as { kind: string; amount: number; method: string | null; note: string | null; at: string }[]).map((m) => ({ ...m, amount: Number(m.amount) }))} canSettle={can(me, "cust.settle")} canComp={["comp.money", "comp.items", "comp.gift"].some((p) => can(me, p))} />
      <form action={editCustomer} className="card" style={{ display: "grid", gap: 8 }}>
        <h2 style={{ margin: 0 }}>بياناته</h2>
        <input type="hidden" name="id" value={cid} />
        <div className="row">
          <label className="fld" style={{ flex: 1 }}>الاسم<input name="name" required defaultValue={c.name ?? ""} /></label>
          <label className="fld" style={{ flex: 1 }}>الشركة (لو عميل شركة)<input name="company" defaultValue={c.company ?? ""} /></label>
          <label className="fld">الرقم الضريبي<input name="tax_no" defaultValue={c.tax_no ?? ""} dir="ltr" /></label>
        </div>
        <label className="fld">ملاحظات عن العميل<input name="notes" defaultValue={c.notes ?? ""} placeholder="مثلاً: بيحب التقطيع رفيع، بيدفع فيزا" /></label>
        <button className="btn pri" style={{ justifySelf: "start" }}>احفظ</button>
      </form>
      <div className="card" style={{ display: "grid", gap: 10 }}>
        <h2 style={{ margin: 0 }}>عناوينه</h2>
        {A.map((a) => (
          <details key={a.id} className="card" style={{ background: "transparent" }}>
            <summary>📍 <b>{a.label ?? "عنوان"}</b>{a.is_default ? " (الأساسي)" : ""} — {D.find((d) => d.id === a.district_id)?.name ?? ""} · {a.address}{a.floor ? ` · الدور ${a.floor}` : ""}{a.apt ? ` · شقة ${a.apt}` : ""}{a.landmark ? ` · ${a.landmark}` : ""}</summary>
            <div style={{ marginTop: 8 }}>{addrForm(a)}</div>
            <form action={removeAddress} style={{ marginTop: 6 }}><input type="hidden" name="aid" value={a.id} /><input type="hidden" name="customer" value={cid} /><button className="btn">شيل العنوان ده</button></form>
          </details>
        ))}
        {!A.length && <div className="muted">مفيش عناوين لسه.</div>}
        <details><summary><b>+ عنوان جديد</b></summary><div style={{ marginTop: 8 }}>{addrForm()}</div></details>
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>آخر طلباته</h2>
        {((orders ?? []) as O[]).map((o) => (
          <div key={o.no} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line, #333)", padding: "6px 0" }}>
            <span><b>#{o.no}</b> · {new Date(o.created_at).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })} · {Math.round(Number(o.total ?? o.est_total ?? 0))} ج · {ST[o.status] ?? o.status}</span>
            <Link className="btn" style={{ height: 30 }} href={`/t/${o.token}`}>تتبّع</Link>
          </div>
        ))}
        {!(orders ?? []).length && <div className="muted">مفيش طلبات.</div>}
      </div>
    </>
  );
}
