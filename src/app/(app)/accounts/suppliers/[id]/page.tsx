import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "../../Tabs";
import Pay from "./Pay";

export default async function Statement({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await getMe();
  const sb = await supabaseServer();
  const [{ data: b }, { data: L }] = await Promise.all([
    sb.from("supplier_balances").select("*").eq("supplier_id", id).single(),
    sb.from("supplier_ledger").select("*").eq("supplier_id", id).order("at"),
  ]);
  if (!b) notFound();
  let run = 0;
  const rows = (L ?? []).map((r) => { run += Number(r.debit) - Number(r.credit); return { ...r, run }; });
  return (
    <>
      <div className="top"><h1>كشف حساب — {b.name}</h1></div>
      <Tabs cur="/accounts/suppliers" />
      <div className="kpis">
        <div className="kpi"><span>اتورّد</span><b className="num">{Math.round(+b.purchases).toLocaleString("en-US")}</b></div>
        <div className="kpi"><span>اتدفع</span><b className="num">{Math.round(+b.paid).toLocaleString("en-US")}</b></div>
        <div className="kpi"><span>الباقي</span><b className="num" style={{ color: +b.balance > 0 ? "var(--bad)" : undefined }}>{Math.round(+b.balance).toLocaleString("en-US")}</b><small>{b.terms}</small></div>
      </div>
      {can(me, "acc.pay") && <div className="noprint"><Pay sup={id} balance={+b.balance} /></div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <div className="row noprint" style={{ justifyContent: "space-between" }}><h2>الحركة</h2></div>
        <table>
          <thead><tr><th>التاريخ</th><th>المرجع</th><th>بيان</th><th>مدين (توريد)</th><th>دائن (دفع)</th><th>الرصيد</th></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}><td className="num">{new Date(r.at).toLocaleDateString("en-CA")}</td><td className="num">{r.ref}</td><td>{r.note}</td>
              <td className="num">{+r.debit ? Math.round(+r.debit).toLocaleString("en-US") : ""}</td><td className="num">{+r.credit ? Math.round(+r.credit).toLocaleString("en-US") : ""}</td>
              <td className="num"><b>{Math.round(r.run).toLocaleString("en-US")}</b></td></tr>
          ))}{!rows.length && <tr><td colSpan={6} className="muted">مفيش حركة</td></tr>}</tbody>
        </table>
      </div>
    </>
  );
}
