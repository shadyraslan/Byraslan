import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs from "./Tabs";
import NewPo from "./NewPo";
import { approvePo } from "./actions";
import CancelBox from "@/components/CancelBox";
import PoQty from "./PoQty";

type Po = { id: number; no: number; status: string; expected: string | null; created_at: string; location_id: string; auto: boolean; note: string | null; cancel_reason?: string | null; suppliers: { name: string } | { name: string }[] | null; po_lines: { line: number; qty: number; price: number; received: number; items: { name: string } | { name: string }[] | null }[] };
type Need = { item_id: number; name: string; unit: string; loc: string; loc_name: string; min: number; stock: number; incoming: number; qty: number; po_no: number | null; supplier: { id: number; name: string; price: number | null } | null; needs: boolean };
type Rc = { id: number; no: number; result: string; at: string; flags: string[]; suppliers: { name: string } | { name: string }[] | null };
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const ST: Record<string, string> = { draft: "مستني اعتماد", open: "مستني", partial: "وصل جزء", done: "وصل كله", cancelled: "اتلغى" };

export default async function Purchasing({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const { err } = await searchParams;
  const me = await getMe();
  const canP = can(me, "purchase.edit"), canR = canP || can(me, "stock.edit");
  if (!canR) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: pos }, { data: rcs }, { data: sups }, { data: items }, { data: isup }, { data: locs }, { data: needs }] = await Promise.all([
    sb.from("purchase_orders").select("id,no,status,expected,created_at,location_id,auto,note,cancel_reason,suppliers(name),po_lines(line,qty,price,received,items(name))").order("id", { ascending: false }).limit(60),
    sb.from("receipts").select("id,no,result,at,flags,suppliers(name)").order("id", { ascending: false }).limit(30),
    sb.from("suppliers").select("id,name").eq("active", true).order("name"),
    // الخامات والتغليف + كل أصناف السوبر ماركت
    sb.from("items").select("id,name,unit,kind,arm").eq("active", true).or("kind.in.(raw,mix,pack,semi),arm.eq.market").order("name"),
    sb.from("item_suppliers").select("item_id,supplier_id,price"),
    sb.from("locations").select("id,name,type").eq("active", true).in("type", ["warehouse", "dark", "shop", "factory"]).order("sort"),
    sb.rpc("purchase_needs"),
  ]);
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const N = (needs ?? []) as Need[];
  const its = (items ?? []).map((i) => ({ id: Number(i.id), name: i.name as string, unit: i.unit as string, prices: Object.fromEntries((isup ?? []).filter((x) => Number(x.item_id) === Number(i.id) && x.price != null).map((x) => [Number(x.supplier_id), Number(x.price)])) }));
  return (
    <>
      <div className="top"><h1>المشتريات</h1></div>
      <Tabs cur="/purchasing" />
      {err && <div className="badmsg">{err}</div>}
      {N.length > 0 && (
        <div className="card" style={{ overflowX: "auto", borderColor: "var(--y)" }}>
          <h2>أصناف وصلت للحد الأدنى</h2>
          <table>
            <thead><tr><th>الصنف</th><th>فين</th><th>الرصيد / الحد</th><th>جاي في أوامر</th><th>هيتطلب</th><th>المورد</th></tr></thead>
            <tbody>{N.map((n) => (
              <tr key={`${n.item_id}|${n.loc}`}>
                <td>{n.name}</td><td>{n.loc_name}</td>
                <td className="num">{n.stock} / {n.min} {n.unit}</td>
                <td className="num">{n.incoming > 0 ? <>{n.incoming}{n.po_no ? <div className="muted" style={{ fontSize: 12 }}>PO-{n.po_no}</div> : null}</> : "—"}</td>
                <td className="num">{n.needs ? n.qty : "متغطي"}</td>
                <td>{n.supplier ? n.supplier.name : <Link href={`/purchasing/specs/${n.item_id}`} style={{ color: "var(--bad)" }}>مالوش مورد — حطه من كارت الصنف</Link>}</td>
              </tr>))}
            </tbody>
          </table>
          <div className="note">كل ربع ساعة السيستم بيعمل أمر شراء أوتوماتيك للمورد الأول لأي صنف وصل للحد ومفيش له أمر مفتوح. الكمية = «كمية الطلب» في الصنف (أو «كمية الإنتاج/الطلب» في الحد الأدنى للفرع)، ولو مش متحددة بيطلب لحد ضعف الحد الأدنى (من الإعدادات). الأوامر الأوتوماتيك بتستنى اعتمادك قبل ما تتبعت.</div>
        </div>
      )}
      {canP && <NewPo suppliers={(sups ?? []).map((s) => ({ id: Number(s.id), name: s.name as string }))} items={its} locs={(locs ?? []).map((l) => ({ id: l.id as string, name: l.name as string }))} />}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>أوامر التوريد</h2>
        <table>
          <thead><tr><th>الأمر</th><th>المورد</th><th>الأصناف</th><th>القيمة</th><th>الحالة</th><th></th></tr></thead>
          <tbody>
            {((pos ?? []) as unknown as Po[]).map((p) => (
              <tr key={p.id}>
                <td className="num">PO-{p.no}{p.auto && <div><span className="pill" style={{ fontSize: 11 }}>أوتوماتيك</span></div>}</td><td>{one(p.suppliers)?.name}<div className="muted" style={{ fontSize: 12 }}>← {LN.get(p.location_id) ?? p.location_id}</div></td>
                <td style={{ whiteSpace: "normal" }}>{p.po_lines.map((l, i) => <div key={i} style={{ fontSize: 12.5 }}>{one(l.items)?.name} {["draft", "open"].includes(p.status) && canP && !l.received ? <PoQty po={p.id} line={l.line} qty={Number(l.qty)} /> : <span className="num">{l.received > 0 ? `${l.received}/` : ""}{l.qty}</span>}</div>)}</td>
                <td className="num">{p.po_lines.reduce((a, l) => a + Number(l.qty) * Number(l.price), 0).toLocaleString("en-US")}</td>
                <td>{ST[p.status] ?? p.status}{p.cancel_reason && <div className="muted" style={{ fontSize: 12 }}>{p.cancel_reason}</div>}{p.expected ? <div className="muted num" style={{ fontSize: 12 }}>{p.expected}</div> : null}</td>
                <td className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  {["open", "partial"].includes(p.status) && <Link className="btn pri" href={`/purchasing/receive/${p.id}`} style={{ display: "inline-grid", placeItems: "center", height: 34 }}>استلم</Link>}
                  {p.status === "draft" && canP && <form action={approvePo}><input type="hidden" name="id" value={p.id} /><button className="btn pri" style={{ height: 34 }}>اعتمد</button></form>}
                  {["open", "draft", "partial"].includes(p.status) && canP && <CancelBox kind="po" id={p.id} label="إلغاء الأمر" />}
                </td>
              </tr>
            ))}
            {!pos?.length && <tr><td colSpan={6} className="muted">لسه مفيش أوامر توريد</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>أذون الاستلام</h2>
        <table>
          <thead><tr><th>الإذن</th><th>المورد</th><th>النتيجة</th><th>ملاحظات</th><th></th></tr></thead>
          <tbody>
            {((rcs ?? []) as unknown as Rc[]).map((r) => (
              <tr key={r.id}><td className="num">GRN-{r.no}</td><td>{one(r.suppliers)?.name}</td><td>{r.result}</td><td style={{ whiteSpace: "normal", fontSize: 12.5, color: r.flags.length ? "var(--bad)" : undefined }}>{r.flags.join(" · ")}</td>
                <td><Link className="btn" href={`/purchasing/receipts/${r.id}`} style={{ display: "inline-grid", placeItems: "center", height: 32 }}>اعرض + ملصقات اللوت</Link></td></tr>
            ))}
            {!rcs?.length && <tr><td colSpan={5} className="muted">لسه مفيش استلام</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
