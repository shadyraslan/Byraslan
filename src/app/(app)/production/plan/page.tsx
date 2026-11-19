import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

type P = { item_id: number; name: string; unit: string; req: number; per: { loc: string; qty: number; trip_at: string; status: string }[]; fmin: number; stock: number; running: number; running_n: number; make: number; route: boolean; next: string | null };
const r3 = (n: number) => Math.round(Number(n) * 1000) / 1000;
const t = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", weekday: "short", hour: "numeric", minute: "2-digit" });

/** خطة الإنتاج: طلبات الفروع + الحد الأدنى للمصنع − الجاهز في المصنع − اللي بيتعمل دلوقتي */
export default async function Plan() {
  const me = await getMe();
  if (!["prod.orders", "stock.view", "trips.load"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("prod_plan");
  const P = (data ?? []) as P[];
  const todo = P.filter((p) => p.make > 0);
  return (
    <>
      <div className="top"><h1>خطة الإنتاج {todo.length ? `· ${todo.length} صنف محتاج يتعمل` : ""}</h1></div>
      <div className="muted" style={{ marginTop: -6, marginBottom: 10 }}>المطلوب يتعمل = طلبات الفروع (من «طلبات الفروع الأوتوماتيك») + الحد الأدنى لمخزون المصنع − الجاهز في المصنع − أوامر الإنتاج الشغالة. أمر الإنتاج بيتعمل بإيد اللي معاه صلاحية «أوامر الإنتاج»، والناتج بيتوزّع على الفروع وقت تحميل العربية.</div>
      {error && <div className="badmsg">{error.message}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>المنتج</th><th>طلبات الفروع</th><th>حد المصنع</th><th>جاهز في المصنع</th><th>بيتعمل</th><th>المطلوب يتعمل</th><th></th></tr></thead>
          <tbody>{P.map((p) => (
            <tr key={p.item_id}>
              <td><Link href={`/items/${p.item_id}`}><b>{p.name}</b></Link>{p.next && <div className="muted" style={{ fontSize: 12 }}>أول عربية: {t(p.next)}</div>}</td>
              <td className="num">{r3(p.req)} {p.unit}{p.per.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{p.per.map((x, i) => <div key={i}>{x.loc}: {r3(x.qty)}</div>)}</div>}</td>
              <td className="num">{r3(p.fmin)}</td>
              <td className="num">{r3(p.stock)}</td>
              <td className="num">{p.running_n ? `${r3(p.running)} (${p.running_n} أمر)` : "—"}</td>
              <td className="num" style={{ color: p.make > 0 ? "var(--bad)" : "var(--good)", fontWeight: 800 }}>{p.make > 0 ? `${r3(p.make)} ${p.unit}` : "متغطّي ✓"}</td>
              <td>{p.make > 0 && (!p.route ? <span className="muted">مالوش مشوار على الغرف — <Link href="/production/routes">حدده</Link></span>
                : can(me, "prod.orders") ? <Link className="btn pri" href={`/production?item=${p.item_id}&qty=${Math.ceil(p.make)}`} style={{ display: "inline-grid", placeItems: "center" }}>اعمل أمر إنتاج</Link> : null)}</td>
            </tr>))}
            {!P.length && <tr><td colSpan={7} className="muted">مفيش طلبات من الفروع ولا حد أدنى للمصنع — كله متغطّي.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
