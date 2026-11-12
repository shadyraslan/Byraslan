import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can, need } from "@/lib/perms";
import ReturnBox from "@/components/ReturnBox";

type R = { id: number; no: number; at: string; sale_no: number; branch: string; reason: string; total: number; cash: number; card: number; credit: number; staff: number; points: number; who: string | null;
  lines: { name: string; qty: number; total: number; restock: boolean }[] };
export const dynamic = "force-dynamic";
async function saveDays(fd: FormData) {
  "use server";
  await need("settings.edit");
  const sb = await supabaseServer();
  await sb.from("settings").upsert({ key: "returns", value: { max_days: Math.max(Number(fd.get("days")) || 0, 0), restock_default: true }, updated_at: new Date().toISOString() });
  revalidatePath("/returns");
}
const f2 = (n: number) => Number(n).toLocaleString("ar-EG", { maximumFractionDigits: 2 });

/** مرتجعات الكاشير: تقرير بالفرع والفترة + تنفيذ مرتجع من الداشبورد لصاحب الصلاحية */
export default async function Returns({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; loc?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["pos.return", "pos.shift", "acc.view"].some((p) => can(me, p))) redirect("/dashboard");
  const today = new Date().toISOString().slice(0, 10);
  const from = sp.from ?? new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10), to = sp.to ?? today;
  const sb = await supabaseServer();
  const [{ data }, { data: locs }, { data: cfg }] = await Promise.all([
    sb.rpc("returns_list", { p_from: from, p_to: to, p_loc: sp.loc || null }),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    sb.from("settings").select("value").eq("key", "returns").maybeSingle(),
  ]);
  const L = (data ?? []) as R[];
  const sum = (k: keyof R) => L.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const reasons = Object.entries(L.reduce<Record<string, number>>((m, r) => ({ ...m, [r.reason]: (m[r.reason] ?? 0) + Number(r.total) }), {})).sort((a, b) => b[1] - a[1]);
  const lost = L.reduce((a, r) => a + r.lines.filter((l) => !l.restock).reduce((x, l) => x + Number(l.total), 0), 0);
  return (
    <>
      <div className="top"><h1>مرتجعات الكاشير</h1></div>
      <form className="row" style={{ marginBottom: 10 }}>
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <label className="fld">الفرع<select name="loc" defaultValue={sp.loc ?? ""}><option value="">كل الفروع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <button className="btn">اعرض</button>
      </form>
      <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", marginBottom: 10 }}>
        <div className="card"><div className="muted">عدد المرتجعات</div><b style={{ fontSize: 22 }}>{L.length}</b></div>
        <div className="card"><div className="muted">قيمة المرتجع</div><b style={{ fontSize: 22 }}>{f2(sum("total"))}</b></div>
        <div className="card"><div className="muted">كاش اترجع من الأدراج</div><b style={{ fontSize: 22 }}>{f2(sum("cash"))}</b></div>
        <div className="card"><div className="muted">تالف مارجعش المخزن</div><b style={{ fontSize: 22, color: lost > 0 ? "#e11d48" : undefined }}>{f2(lost)}</b></div>
      </div>
      {reasons.length > 0 && <div className="card muted" style={{ marginBottom: 10 }}>الأسباب: {reasons.map(([k, v]) => `${k} ${f2(v)} ج`).join(" · ")}</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>رقم</th><th>الوقت</th><th>الفرع</th><th>الفاتورة</th><th>الأصناف</th><th>السبب</th><th>القيمة</th><th>رجع إزاي</th><th>مين</th></tr></thead>
          <tbody>{L.map((r) => (
            <tr key={r.id}>
              <td>R-{r.no}</td><td>{new Date(r.at).toLocaleString("ar-EG", { day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" })}</td><td>{r.branch}</td><td>S-{r.sale_no}</td>
              <td style={{ fontSize: 13 }}>{r.lines.map((l) => `${l.name} × ${l.qty}${l.restock ? "" : " (تالف)"}`).join("، ")}</td>
              <td>{r.reason}</td><td className="num"><b>{f2(r.total)}</b></td>
              <td style={{ fontSize: 12 }}>{[["كاش", r.cash], ["فيزا", r.card], ["آجل", r.credit], ["موظف", r.staff], ["نقاط", r.points]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k} ${f2(Number(v))}`).join(" · ")}</td>
              <td className="muted">{r.who}</td>
            </tr>))}
            {!L.length && <tr><td colSpan={9} className="muted">مفيش مرتجعات في الفترة دي</td></tr>}
          </tbody>
        </table>
      </div>
      {can(me, "pos.return") && <div style={{ marginTop: 10 }}><ReturnBox /></div>}
      <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>صلاحية «مرتجع فاتورة كاشير» بتتدّي من صفحة الصلاحيات لأي حد، بحد أقصى للمبلغ في المرة وتاريخ انتهاء. اللي معاه الصلاحية بيلاقي زرار «مرتجع» في الكاشير.</div>
      {can(me, "settings.edit")
        ? <form action={saveDays} className="card row" style={{ alignItems: "end", marginTop: 8 }}><label className="fld">المرتجع مسموح لحد (يوم من الفاتورة)<input name="days" type="number" min={0} defaultValue={(cfg?.value as { max_days?: number } | null)?.max_days ?? 14} style={{ width: 90 }} /></label><button className="btn">حفظ</button></form>
        : <div className="muted" style={{ fontSize: 13 }}>المرتجع مسموح لحد {(cfg?.value as { max_days?: number } | null)?.max_days ?? 14} يوم من الفاتورة.</div>}
    </>
  );
}
