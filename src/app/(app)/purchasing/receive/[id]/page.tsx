import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Receive, { type RLine } from "./Receive";
import { getMe, can } from "@/lib/perms";

type Snap = { checks?: string[]; certs?: string[]; temp_max?: number | null; min_shelf_days?: number };

export default async function ReceivePage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const sb = await supabaseServer();
  const { data: po } = await sb.from("purchase_orders").select("id,no,status,suppliers(name),po_lines(line,item_id,qty,price,received,items(name,unit))").eq("id", id).single();
  if (!po) notFound();
  const P = po as unknown as { id: number; no: number; status: string; suppliers: { name: string } | null; po_lines: { line: number; item_id: number; qty: number; price: number; received: number; items: { name: string; unit: string } | null }[] };
  const ids = P.po_lines.map((l) => l.item_id);
  const me = await getMe();
  const [{ data: specs }, { data: ovs }, { data: bc }] = await Promise.all([
    sb.from("spec_current").select("item_id,version,snapshot").in("item_id", ids),
    sb.from("override_requests").select("id,reason").eq("kind", "recv").eq("ref", `PO-${P.no}`).eq("status", "approved"),
    sb.from("item_barcodes").select("code,item_id").in("item_id", ids),
  ]);
  const S = new Map<number, { version: number; snapshot: Snap }>(((specs ?? []) as unknown as { item_id: number; version: number; snapshot: Snap }[]).map((s) => [Number(s.item_id), s]));
  const lines: RLine[] = P.po_lines.filter((l) => l.received < l.qty * 0.99).sort((a, b) => a.line - b.line).map((l) => {
    const s = S.get(Number(l.item_id));
    return { line: l.line, item_id: Number(l.item_id), item: l.items?.name ?? "", unit: l.items?.unit ?? "", qty: Number(l.qty), left: Number(l.qty) - Number(l.received), price: Number(l.price), ver: s?.version ?? null,
      checks: s?.snapshot.checks ?? [], certs: s?.snapshot.certs ?? [], temp_max: s?.snapshot.temp_max ?? null, min_days: s?.snapshot.min_shelf_days ?? 0 };
  });
  return (
    <>
      <div className="top"><h1>استلام PO-{P.no} — {P.suppliers?.name}</h1></div>
      {!["open", "partial"].includes(P.status) ? <div className="badmsg">أمر التوريد ده مش مفتوح</div>
        : <Receive po={P.id} poNo={P.no} lines={lines} codes={(bc ?? []).map((b) => [String(b.code), Number(b.item_id)] as [string, number])} canLink={can(me, "barcode.link") || can(me, "items.edit")} approved={(ovs ?? []).map((o) => ({ id: Number(o.id), reason: o.reason as string }))} />}
    </>
  );
}
