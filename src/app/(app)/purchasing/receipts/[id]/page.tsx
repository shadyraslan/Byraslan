import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Labels from "./Labels";

export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ by?: string }> }) {
  const id = Number((await params).id);
  const byNo = (await searchParams).by === "no";
  const sb = await supabaseServer();
  const { data } = await sb.from("receipts").select("id,no,result,flags,invoice_no,at,purchase_orders(no),suppliers(name),receipt_lines(line,weighed,rejected,accepted,price,temp,expires,spec_version,lot_code,items(name,unit))").eq(byNo ? "no" : "id", id).single();
  if (!data) notFound();
  const R = data as unknown as { no: number; result: string; flags: string[]; invoice_no: string | null; at: string; purchase_orders: { no: number } | null; suppliers: { name: string } | null;
    receipt_lines: { line: number; weighed: number; rejected: number; accepted: number; price: number; temp: number | null; expires: string | null; spec_version: number | null; lot_code: string | null; items: { name: string; unit: string } | null }[] };
  const L = R.receipt_lines.sort((a, b) => a.line - b.line);
  return (
    <>
      <div className="top noprint"><h1>إذن استلام GRN-{R.no}</h1></div>
      <div className="card noprint">
        <div>المورد: <b>{R.suppliers?.name}</b> · أمر التوريد PO-{R.purchase_orders?.no} · الفاتورة {R.invoice_no ?? "—"} · <b>{R.result}</b></div>
        {R.flags.map((f, i) => <div key={i} style={{ color: "var(--bad)" }}>• {f}</div>)}
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>الصنف</th><th>اتوزن</th><th>مرفوض</th><th>مقبول</th><th>السعر</th><th>الحرارة</th><th>الصلاحية</th><th>اللوت</th></tr></thead>
          <tbody>{L.map((l) => <tr key={l.line}><td>{l.items?.name} {l.spec_version ? <span className="muted">v{l.spec_version}</span> : null}</td><td className="num">{l.weighed}</td><td className="num">{l.rejected}</td><td className="num">{l.accepted}</td><td className="num">{l.price}</td><td className="num">{l.temp ?? "—"}</td><td className="num">{l.expires ?? "—"}</td><td className="num" dir="ltr">{l.lot_code ?? "—"}</td></tr>)}</tbody>
        </table>
      </div>
      <Labels lots={L.filter((l) => l.lot_code).map((l) => ({ code: l.lot_code!, name: l.items?.name ?? "", qty: `${l.accepted} ${l.items?.unit ?? ""}`, exp: l.expires, sup: R.suppliers?.name ?? "" }))} />
    </>
  );
}
