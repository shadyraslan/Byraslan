import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Export from "../../users/report/Export";
import SettleRow from "./SettleRow";

type B = { customer_id: number; name: string; phone: string; balance: number; since: string; last: string; moves: number };
type Cp = { no: number; kind: string; value: number; method: string | null; reason: string; at: string; order_id: number | null; new_order_id: number | null; sale_id: number | null; location_id: string | null; customers: { name: string; phone: string } | null; by: string | null };
type Rt = { no: number; total: number; method: string; reason: string; at: string; online_orders: { no: number; customers: { name: string } | null } | null; by: string | null };
const KIND: Record<string, string> = { money: "💵 فلوس", items: "🔁 أصناف", gift: "🎁 هدية" };
const MET: Record<string, string> = { balance: "رصيد", cash: "كاش", instapay: "إنستاباي", wallet: "محفظة", credit: "آجل" };
const d = (s: string) => new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "short" });
const days = (s: string) => Math.floor((Date.now() - new Date(s).getTime()) / 864e5);

/** أرصدة العملاء (دفع زيادة / أقل لحد التسوية) + تقرير التعويضات والمرتجعات */
export default async function Balances({ searchParams }: { searchParams: Promise<{ t?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["cs.agent", "orders.handle", "acc.view", "cust.settle", "comp.money"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const t = sp.t ?? "bal";
  const from = sp.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to = sp.to || new Date().toISOString().slice(0, 10);
  const end = new Date(new Date(to).getTime() + 864e5).toISOString();
  const tabs: [string, string][] = [["bal", "أرصدة العملاء"], ["comp", "التعويضات"], ["ret", "مرتجعات الأونلاين"]];
  const { data: ps } = t === "bal" ? { data: [] } : await sb.from("profiles").select("id,name");
  const names = Object.fromEntries(((ps ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const head = (
    <>
      <div className="top"><h1>الأرصدة والتعويضات</h1></div>
      <style>{`.bl-list{display:grid;gap:8px}.bl-row{display:grid;gap:4px;border:1px solid var(--line);border-radius:14px;padding:10px 12px;background:var(--panel)}.bl-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}.bl-stat{border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--panel)}.bl-stat b{font-size:20px;display:block}`}</style>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>{tabs.map(([k, l]) => <Link key={k} href={`?t=${k}`} className={t === k ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>
      {t !== "bal" && (
        <form className="card row">
          <input type="hidden" name="t" value={t} />
          <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
          <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
          <button className="btn pri">اعرض</button>
        </form>
      )}
    </>
  );

  if (t === "comp") {
    const { data } = await sb.from("compensations").select("no,kind,value,method,reason,at,by,order_id,new_order_id,sale_id,location_id,customers(name,phone)").gte("at", from).lt("at", end).order("at", { ascending: false }).limit(1000);
    const C = (data ?? []) as unknown as Cp[];
    const tot = (k: string) => Math.round(C.filter((x) => x.kind === k).reduce((a, x) => a + Number(x.value), 0));
    return (
      <>
        {head}
        <div className="bl-stats">{Object.entries(KIND).map(([k, l]) => <div key={k} className="bl-stat"><div className="muted">{l}</div><b className="num">{tot(k)} ج</b><div className="muted">{C.filter((x) => x.kind === k).length} مرة</div></div>)}</div>
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>كل التعويضات ({C.length})</h2><Export file="التعويضات" rows={C.map((x) => ({ رقم: x.no, التاريخ: d(x.at), النوع: KIND[x.kind], القيمة: x.value, الطريقة: x.method ? MET[x.method] ?? x.method : "", العميل: x.customers?.name ?? "", السبب: x.reason, الفرع: x.location_id ?? "", "مين عمله": (names[x.by ?? ""] ?? "") }))} /></div>
          <div className="bl-list">{C.map((x) => (
            <div key={x.no} className="bl-row">
              <div className="row" style={{ justifyContent: "space-between" }}><b>{KIND[x.kind]} · {x.customers?.name ?? "عميل كاشير"}</b><b className="num">{x.value} ج</b></div>
              <div className="muted">{d(x.at)} · {x.reason}{x.method ? ` · ${MET[x.method] ?? x.method}` : ""}{x.new_order_id ? ` · طلب جديد` : ""}{x.sale_id ? " · فاتورة كاشير" : ""} · {(names[x.by ?? ""] ?? "")}</div>
            </div>
          ))}{!C.length && <div className="muted">مفيش تعويضات في الفترة دي</div>}</div>
        </div>
      </>
    );
  }

  if (t === "ret") {
    const { data } = await sb.from("order_returns").select("no,total,method,reason,at,by,online_orders(no,customers(name))").gte("at", from).lt("at", end).order("at", { ascending: false }).limit(1000);
    const R = (data ?? []) as unknown as Rt[];
    return (
      <>
        {head}
        <div className="card">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>مرتجعات الأونلاين ({R.length}) — {Math.round(R.reduce((a, x) => a + Number(x.total), 0))} ج</h2><Export file="مرتجعات-الأونلاين" rows={R.map((x) => ({ رقم: x.no, التاريخ: d(x.at), الطلب: x.online_orders?.no ?? "", العميل: x.online_orders?.customers?.name ?? "", القيمة: x.total, الطريقة: MET[x.method] ?? x.method, السبب: x.reason }))} /></div>
          <div className="bl-list">{R.map((x) => (
            <div key={x.no} className="bl-row">
              <div className="row" style={{ justifyContent: "space-between" }}><b>طلب #{x.online_orders?.no} · {x.online_orders?.customers?.name}</b><b className="num">{x.total} ج</b></div>
              <div className="muted">{d(x.at)} · {x.reason} · {MET[x.method] ?? x.method} · {(names[x.by ?? ""] ?? "")}</div>
            </div>
          ))}{!R.length && <div className="muted">مفيش مرتجعات في الفترة دي</div>}</div>
        </div>
      </>
    );
  }

  const { data } = await sb.rpc("cust_balances");
  const B = (data ?? []) as B[];
  const owe = B.filter((b) => b.balance < 0), cred = B.filter((b) => b.balance > 0);
  const sum = (L: B[]) => Math.round(L.reduce((a, b) => a + Math.abs(Number(b.balance)), 0));
  const canSettle = can(me, "cust.settle");
  const list = (L: B[], bad: boolean) => (
    <div className="bl-list">{L.map((b) => (
      <div key={b.customer_id} className="bl-row">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span><Link href={`/cs/customers/${b.customer_id}`}><b>{b.name}</b></Link> · <a href={`tel:${b.phone}`} className="num">{b.phone}</a></span>
          <b className="num" style={{ color: bad ? "var(--bad)" : "var(--good)" }}>{bad ? "عليه" : "ليه"} {Math.abs(b.balance)} ج</b>
        </div>
        <div className="muted">من {d(b.since)} ({days(b.since)} يوم) · آخر حركة {d(b.last)} · {b.moves} حركة{bad && days(b.since) >= 2 ? " · ⚠️ متأخر" : ""}</div>
        {canSettle && <SettleRow customerId={b.customer_id} balance={Number(b.balance)} />}
      </div>
    ))}{!L.length && <div className="muted">مفيش</div>}</div>
  );
  return (
    <>
      {head}
      <div className="bl-stats">
        <div className="bl-stat"><div className="muted">عملاء عليهم فلوس</div><b className="num" style={{ color: "var(--bad)" }}>{sum(owe)} ج</b><div className="muted">{owe.length} عميل</div></div>
        <div className="bl-stat"><div className="muted">عملاء ليهم رصيد</div><b className="num" style={{ color: "var(--good)" }}>{sum(cred)} ج</b><div className="muted">{cred.length} عميل</div></div>
      </div>
      <div className="card"><div className="row" style={{ justifyContent: "space-between" }}><h2>عليهم (دفعوا أقل)</h2><Export file="أرصدة-العملاء" rows={B.map((b) => ({ العميل: b.name, الموبايل: b.phone, الرصيد: b.balance, الحالة: b.balance < 0 ? "عليه" : "ليه", "من يوم": d(b.since), "آخر حركة": d(b.last) }))} /></div>{list(owe, true)}</div>
      <div className="card"><h2>ليهم (دفعوا زيادة أو تعويض)</h2>{list(cred, false)}</div>
      <div className="muted" style={{ fontSize: 12.5 }}>الرصيد بيتخصم تلقائي من أول فاتورة أو طلب للعميل لو الكاشير اختار «يدفع من رصيده». التسوية بالتحويل من هنا، والكاش من شاشة الكاشير.</div>
    </>
  );
}
