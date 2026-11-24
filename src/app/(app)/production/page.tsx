import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import NewOrder from "./NewOrder";
import CancelBox from "@/components/CancelBox";

type Step = { step: number; status: string; in_weight: number | null; out_weight: number | null; waste: number | null; locations: { name: string } | { name: string }[] | null };
type Ord = { id: number; no: number; qty: number; due: string; status: string; auto?: boolean; note?: string | null; cancel_reason?: string | null; items: { name: string; unit: string } | { name: string; unit: string }[] | null; prod_steps: Step[] };
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const ST: Record<string, string> = { planned: "مستني", running: "شغال", done: "خلص", cancelled: "اتلغى" };

export default async function Production({ searchParams }: { searchParams: Promise<{ item?: string; qty?: string }> }) {
  const pre = await searchParams;
  const me = await getMe();
  if (!can(me, "prod.orders")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: orders }, { data: items }, { data: routes }] = await Promise.all([
    sb.from("prod_orders").select("id,no,qty,due,status,auto,note,cancel_reason,items(name,unit),prod_steps(step,status,in_weight,out_weight,waste,locations(name))").order("id", { ascending: false }).limit(60),
    sb.from("items").select("id,name,unit").eq("active", true).eq("kind", "product").order("name"),
    sb.from("current_routes").select("item_id,step,section_name").order("step"),
  ]);
  const routeOf = (id: number) => (routes ?? []).filter((r) => Number(r.item_id) === id).map((r) => r.section_name as string).join(" ← ");
  return (
    <>
      <div className="top"><h1>أوامر الإنتاج</h1>
        <div className="row"><Link className="btn" href="/station" style={{ display: "inline-grid", placeItems: "center" }}>تابلت الغرف</Link><Link className="btn" href="/production/routes" style={{ display: "inline-grid", placeItems: "center" }}>مشوار المنتجات على الغرف</Link></div>
      </div>
      <NewOrder items={(items ?? []).map((i) => ({ id: Number(i.id), name: i.name as string, unit: i.unit as string, route: routeOf(Number(i.id)) }))} defItem={pre.item} defQty={pre.qty} />
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الأمر</th><th>المنتج</th><th>الكمية</th><th>ميعاده</th><th>الغرف</th><th>الحالة</th></tr></thead>
          <tbody>
            {((orders ?? []) as unknown as Ord[]).map((o) => {
              const it = one(o.items);
              const steps = [...o.prod_steps].sort((a, b) => a.step - b.step);
              return (
                <tr key={o.id}>
                  <td className="num">#{o.no}{o.auto && <div><span className="pill" style={{ fontSize: 11 }}>أوتوماتيك</span></div>}</td><td><b>{it?.name}</b></td><td className="num">{o.qty} {it?.unit}</td><td className="num">{o.due}</td>
                  <td style={{ whiteSpace: "normal" }}>{steps.map((s) => (
                    <span key={s.step} className="pill" style={{ marginInlineEnd: 4, ...(s.status === "done" ? { color: "var(--good)" } : s.status === "running" ? { borderColor: "var(--y)", fontWeight: 700 } : { opacity: 0.6 }) }}>
                      {s.status === "done" ? "✓ " : s.status === "running" ? "▶ " : ""}{one(s.locations)?.name}{s.out_weight ? ` ${s.out_weight}` : s.in_weight ? ` ←${s.in_weight}` : ""}
                    </span>))}</td>
                  <td>{ST[o.status] ?? o.status}{o.cancel_reason && <div className="muted" style={{ fontSize: 12 }}>{o.cancel_reason}</div>}
                    {["planned", "running"].includes(o.status) && <div style={{ marginTop: 4 }}><CancelBox kind="prod" id={o.id} label="إلغاء الأمر" /></div>}</td>
                </tr>
              );
            })}
            {!orders?.length && <tr><td colSpan={6} className="muted">لسه مفيش أوامر</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
