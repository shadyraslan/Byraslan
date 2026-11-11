import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import Tabs from "../Tabs";

export default async function SupplierAccounts() {
  const sb = await supabaseServer();
  const { data } = await sb.from("supplier_balances").select("*").order("balance", { ascending: false });
  const R = data ?? [];
  const tot = R.reduce((a, r) => a + Number(r.balance), 0);
  return (
    <>
      <div className="top"><h1>حسابات الموردين</h1></div>
      <Tabs cur="/accounts/suppliers" />
      <div className="kpis"><div className="kpi"><span>إجمالي اللي علينا</span><b className="num">{Math.round(tot).toLocaleString("en-US")}</b></div></div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>المورد</th><th>الشروط</th><th>اتورّد</th><th>اتدفع</th><th>الباقي</th><th>آخر دفعة</th></tr></thead>
          <tbody>{R.map((r) => (
            <tr key={r.supplier_id}><td><Link href={`/accounts/suppliers/${r.supplier_id}`}><b>{r.name}</b></Link> <Link className="muted" style={{ fontSize: 12 }} href={`/accounts/ledger?t=supplier&id=${r.supplier_id}`}>كارت الحساب</Link></td><td>{r.terms ?? "—"}</td>
              <td className="num">{Math.round(+r.purchases).toLocaleString("en-US")}</td><td className="num">{Math.round(+r.paid).toLocaleString("en-US")}</td>
              <td className="num"><b style={{ color: +r.balance > 0 ? "var(--bad)" : undefined }}>{Math.round(+r.balance).toLocaleString("en-US")}</b></td>
              <td className="num">{r.last_pay ? new Date(r.last_pay).toLocaleDateString("en-CA") : "—"}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
