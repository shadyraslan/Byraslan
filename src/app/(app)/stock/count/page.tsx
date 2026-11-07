import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { startCount } from "./actions";

type C = { id: number; no: number; status: string; location: string; family: string | null; at: string; by: string | null; decided_by: string | null; value: number | null; lines: string; boxes: number };
const ST: Record<string, string> = { open: "بيتعدّ", submitted: "مستني اعتماد", approved: "اتعمد", rejected: "اترفض", cancelled: "اتلغى" };

/** الجرد: ابدأ جرد لموقع (أو قسم منه) — قايمة الجرد بحالاتها */
export default async function Counts({ searchParams }: { searchParams: Promise<{ s?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "stock.count") && !can(me, "stock.adjust") && !can(me, "stock.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: locs }, { data: fams }, { data: cfg }] = await Promise.all([
    sb.rpc("count_list", { p_status: sp.s || null }),
    sb.from("locations").select("id,name,type").eq("active", true).neq("type", "section").order("sort"),
    sb.from("families").select("id,name").order("sort"),
    sb.from("settings").select("value").eq("key", "stock.count").maybeSingle(),
  ]);
  const L = (data ?? []) as C[];
  const c = (cfg?.value ?? {}) as { blind?: boolean; reason_over?: number };
  const canStart = can(me, "stock.count") || can(me, "stock.adjust");
  return (
    <>
      <div className="top"><h1>الجرد</h1><Link className="btn" href="/stock" style={{ display: "inline-grid", placeItems: "center" }}>→ المخزون</Link></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {canStart && (
        <form action={startCount} className="card row" style={{ alignItems: "end" }}>
          <label className="fld">الموقع<select name="loc" required>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="fld">القسم (اختياري)<select name="family" defaultValue=""><option value="">كل الأصناف</option>{(fams ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
          <label className="fld" style={{ flex: 1 }}>ملاحظة<input name="note" placeholder="جرد آخر الشهر / جرد مفاجئ…" /></label>
          <button className="btn pri">ابدأ جرد</button>
        </form>
      )}
      <div className="row" style={{ gap: 6, margin: "8px 0" }}>
        {[["", "الكل"], ["open", "بيتعدّ"], ["submitted", "مستني اعتماد"], ["approved", "اتعمد"]].map(([k, l]) => <Link key={k} className={(sp.s ?? "") === k ? "btn pri" : "btn"} href={k ? `/stock/count?s=${k}` : "/stock/count"}>{l}</Link>)}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>#</th><th>الموقع</th><th>القسم</th><th>الحالة</th><th>اتعدّ</th><th>علب</th><th>قيمة الفرق</th><th>مين</th><th>إمتى</th></tr></thead>
          <tbody>
            {L.map((x) => (
              <tr key={x.id}>
                <td><Link href={`/stock/count/${x.id}`}><b>#{x.no}</b></Link></td>
                <td>{x.location}</td><td>{x.family ?? "الكل"}</td>
                <td><span className={x.status === "submitted" ? "pill warn" : "pill"}>{ST[x.status]}</span></td>
                <td className="num">{x.lines}</td><td className="num">{x.boxes}</td>
                <td className="num" style={{ color: Number(x.value) < 0 ? "var(--bad)" : undefined }}>{x.value == null ? "—" : `${money(Number(x.value))} ج`}</td>
                <td>{x.by}{x.decided_by ? <div className="muted" style={{ fontSize: 12 }}>اعتمد: {x.decided_by}</div> : null}</td>
                <td className="muted">{new Date(x.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              </tr>
            ))}
            {!L.length && <tr><td colSpan={9} className="muted">مفيش جرد لسه</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="note">
        {c.blind !== false ? "الجرد أعمى: اللي بيعدّ مابيشوفش رصيد السيستم لحد ما يبعت. " : ""}
        علب روستوز بتتعدّ بالمسح، والباقي بالكمية أو الوزن. بعد الاعتماد كل فرق بيبقى حركة "جرد" بالتكلفة، والعلب اللي ماتمسحتش بتتعلّم مفقودة.
        الاعتماد بصلاحية "اعتماد الجرد" وبحد مبلغ — وإعدادات الجرد من <Link href="/settings">الإعدادات</Link>.
      </div>
    </>
  );
}
