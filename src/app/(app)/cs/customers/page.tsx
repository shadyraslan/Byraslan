import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveCustomer } from "../actions";

type C = { id: number; phone: string; name: string | null; notes: string | null; orders: number; spent: number; last: string | null; tickets: number; area: string | null };

/** العملاء: بحث، عميل جديد بعنوانه، وكل عميل منه طلب جديد ومتابعة طلباته */
export default async function CsCustomers({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "cs.agent") && !can(me, "orders.handle")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: dists }] = await Promise.all([
    sb.rpc("cs_customers", { p_q: sp.q ?? "" }),
    sb.from("districts").select("id,name,city").eq("active", true).order("city").order("name"),
  ]);
  const R = (data ?? []) as C[];
  return (
    <>
      <div className="top"><h1>العملاء</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">اتحفظ</div>}
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld" style={{ flex: 1, minWidth: 200 }}>دوّر بالموبايل أو الاسم<input name="q" defaultValue={sp.q ?? ""} /></label>
        <button className="btn pri">دوّر</button>
      </form>
      <details className="card" open={!!sp.q && !R.length && sp.q.replace(/\D/g, "").length >= 10}>
        <summary><b>+ عميل جديد / تعديل بيانات عميل</b></summary>
        <form action={saveCustomer} style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <div className="row">
            <label className="fld">الموبايل<input name="phone" required dir="ltr" inputMode="tel" defaultValue={sp.q && sp.q.replace(/\D/g, "").length >= 10 ? sp.q : ""} /></label>
            <label className="fld">الاسم<input name="name" required /></label>
          </div>
          <div className="row">
            <label className="fld">المنطقة<select name="district"><option value="">—</option>{(dists ?? []).map((d) => <option key={d.id} value={d.id}>{d.city} — {d.name}</option>)}</select></label>
            <label className="fld">اسم العنوان<input name="label" placeholder="البيت / الشغل" /></label>
          </div>
          <label className="fld">العنوان بالتفصيل<input name="address" /></label>
          <label className="fld">ملاحظات عن العميل<input name="notes" placeholder="مثلاً: بيحب التقطيع رفيع، بيدفع فيزا" /></label>
          <button className="btn pri" style={{ justifySelf: "start" }}>احفظ</button>
        </form>
      </details>
      <div style={{ display: "grid", gap: 8 }}>
        {R.map((c) => (
          <div key={c.id} className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <b>{c.name || "من غير اسم"}</b> <span className="muted" dir="ltr">{c.phone}</span>{c.area ? <span className="muted"> · {c.area}</span> : null}
              <div className="muted" style={{ fontSize: 13 }}>{c.orders} طلب · {Math.round(Number(c.spent))} ج{c.last ? ` · آخر طلب ${new Date(c.last).toLocaleDateString("ar-EG", { day: "numeric", month: "short" })}` : ""}{c.tickets ? ` · ${c.tickets} تذكرة مفتوحة` : ""}</div>
              {c.notes && <div style={{ fontSize: 13 }}>📝 {c.notes}</div>}
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Link className="btn pri" href={`/cs/new?phone=${c.phone}`}>+ طلب / حجز</Link>
              <Link className="btn" href={`/cs/orders?scope=all&q=${c.phone}`}>طلباته</Link>
              <Link className="btn" href={`/accounts/ledger?t=customer&id=${c.id}`}>كارته</Link>
              <a className="btn" href={`https://wa.me/2${c.phone.replace(/^2/, "")}`} target="_blank" rel="noreferrer">واتساب</a>
            </div>
          </div>
        ))}
        {!R.length && <div className="card muted">مفيش عميل بالبحث ده — سجّله من "عميل جديد" فوق.</div>}
      </div>
    </>
  );
}
