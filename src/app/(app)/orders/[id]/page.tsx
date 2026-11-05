import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import OrderDesk from "./OrderDesk";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const me = await getMe();
  const sb = await supabaseServer();
  const { data } = await sb.from("online_orders").select("*,customers(name,phone,area),locations(name),online_order_lines(line,qty,unit_price,prepared,items(name,unit)),online_order_boxes(box_sn,line,qty,removed)").eq("id", id).single();
  if (!data) notFound();
  const o = data as unknown as {
    id: number; no: number; status: string; address: string | null; note: string | null; pay_method: string; est_total: number; total: number | null; delivery_fee: number; driver: string | null; cancel_reason: string | null; created_at: string; token: string; channel: string;
    customers: { name: string; phone: string; area: string | null } | null; locations: { name: string } | null;
    online_order_lines: { line: number; qty: number; unit_price: number; prepared: number; items: { name: string; unit: string } | null }[];
    online_order_boxes: { box_sn: number; line: number; qty: number; removed: boolean }[];
  };
  return <OrderDesk o={{ ...o, online_order_lines: o.online_order_lines.sort((a, b) => a.line - b.line), online_order_boxes: o.online_order_boxes.filter((b) => !b.removed) }} canCancel={can(me, "orders.cancel")} />;
}
