import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { partnerEntry } from "../actions";

type St = { opening: number; closing: number; lines: { day: string; kind: string; amount: number; method: string | null; ref: string | null; note: string | null; bal: number }[] };
type Rc = { day: string; orders: number; receipts: number; system: number; diff: number };
const K: Record<string, string> = { take: "أصناف اتاخدت منه", sale: "بضاعة اتباعتله", settle: "تسوية", adjust: "تعديل" };
const M: Record<string, string> = { offset: "مقاصة ببضاعة", cash: "نقدي", transfer: "تحويل بنكي", instapay: "إنستاباي", carry: "ترحيل" };

/** الحساب الجاري مع الشريك: له وعليه والرصيد، والتسويات، ومطابقة إيصالات المحضّرين */
export default async function Account({ searchParams }: { searchParams: Promise<{ p?: string; from?: string; to?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "partner.settle") && !can(me, "acc.view")) redirect("/partner");
  const sb = await supabaseServer();
  const { data: ps } = await sb.from("partners").select("id,name").order("id");
  const pid = Number(sp.p ?? ps?.[0]?.id ?? 0);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const from = sp.from ?? `${today.slice(0, 7)}-01`, to = sp.to ?? today;
  const [{ data: st }, { data: pbs }] = await Promise.all([
    pid ? sb.rpc("partner_statement", { p_partner: pid, p_from: from, p_to: to }) : Promise.resolve({ data: null }),
    sb.from("partner_branches").select("location_id").eq("partner_id", pid),
  ]);
  const { data: lns } = await sb.from("locations").select("id,name").eq("type", "partner");
  const LN = new Map((lns ?? []).map((l) => [l.id, l.name]));
  const recs = await Promise.all((pbs ?? []).map(async (b) => ({ loc: b.location_id, rows: ((await sb.rpc("partner_recon", { p_loc: b.location_id, p_from: from, p_to: to })).data ?? []) as Rc[] })));
  const S = st as St | null;
  const bal = (n: number) => (n > 0 ? `علينا ${money(n)} ج` : n < 0 ? `لينا ${money(-n)} ج` : "0");
  return (
    <>
      <div className="top"><h1>الحساب الجاري مع الشريك</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">الشريك<select name="p" defaultValue={pid}>{(ps ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn">اعرض</button>
        {pid > 0 && <a className="btn" href={`/accounts/ledger?t=partner&id=${pid}`}>كارت الحساب بالتفاصيل</a>}
      </form>
      {S && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span>أول المدة: <b>{bal(Number(S.opening))}</b></span><span>آخر المدة: <b>{bal(Number(S.closing))}</b></span></div>
          <table>
            <thead><tr><th>اليوم</th><th>البيان</th><th>له</th><th>عليه</th><th>الرصيد</th></tr></thead>
            <tbody>{S.lines.map((l, i) => <tr key={i}><td>{l.day}</td><td>{K[l.kind]}{l.method ? ` — ${M[l.method] ?? l.method}` : ""}{l.ref ? ` · ${l.ref}` : ""}{l.note && <div className="muted" style={{ fontSize: 12 }}>{l.note}</div>}</td>
              <td className="num">{l.amount > 0 ? money(l.amount) : ""}</td><td className="num">{l.amount < 0 ? money(-l.amount) : ""}</td><td className="num">{bal(Number(l.bal))}</td></tr>)}
            {!S.lines.length && <tr><td colSpan={5} className="muted">مفيش حركات في الفترة دي</td></tr>}</tbody>
          </table>
          <div className="note">"له" = أصناف اتاخدت منه بسعره بعد الخصم (بتتسجّل لوحدها لما الطلب يتسلّم). "عليه" = بضاعة باي رسلان اتباعتله والتسويات.</div>
        </div>
      )}
      {can(me, "partner.settle") && pid > 0 && (
        <form action={partnerEntry} className="card row" style={{ alignItems: "end" }}>
          <input type="hidden" name="partner" value={pid} />
          <label className="fld">النوع<select name="kind"><option value="settle">تسوية / دفعة</option><option value="sale">بضاعة اتباعتله</option><option value="adjust">تعديل (+ له / − عليه)</option></select></label>
          <label className="fld">المبلغ<input name="amount" required inputMode="decimal" dir="ltr" style={{ width: 110 }} /></label>
          <label className="fld">الطريقة<select name="method" defaultValue="cash">{Object.entries(M).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="fld" style={{ flex: 1 }}>ملاحظة<input name="note" /></label>
          <button className="btn pri">سجّل</button>
        </form>
      )}
      {recs.map((r) => (
        <div key={r.loc} className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>مطابقة المحضّرين — {LN.get(r.loc) ?? r.loc}</h2>
          <table><thead><tr><th>اليوم</th><th>طلبات</th><th>إيصالات الشريك</th><th>سحبنا في السيستم</th><th>الفرق</th></tr></thead>
            <tbody>{r.rows.map((x) => <tr key={x.day}><td>{x.day}</td><td className="num">{x.orders}</td><td className="num">{money(x.receipts)}</td><td className="num">{money(x.system)}</td><td className="num" style={{ color: Math.abs(Number(x.diff)) > 1 ? "var(--bad)" : undefined }}>{money(x.diff)}</td></tr>)}
            {!r.rows.length && <tr><td colSpan={5} className="muted">مفيش تحضيرات</td></tr>}</tbody></table>
        </div>
      ))}
    </>
  );
}
