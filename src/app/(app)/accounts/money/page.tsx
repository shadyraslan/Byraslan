import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { KINDS } from "./kinds";
import { AccountForm, MoveForms, EditAccount, ReverseBtn, type Acc } from "./MoneyForms";

type M = { id: number; no: number; account_id: number; amount: number; kind: string; ref: string | null; note: string | null; by: string | null; at: string; transfer_id: number | null; reverses: number | null };
const MK: Record<string, string> = { opening: "رصيد أول المدة", in: "إيداع", out: "سحب", transfer_in: "تحويل داخل", transfer_out: "تحويل خارج", fee: "عمولة", reverse: "عكس" };
const f2 = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** الخزن والحسابات: كل مكان فيه فلوس، برصيده وكشف حركته، والتحويل بينهم */
export default async function Money({ searchParams }: { searchParams: Promise<{ acc?: string; new?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  const view = can(me, "money.view") || can(me, "money.manage"), mv = can(me, "money.move"), man = can(me, "money.manage");
  if (!view && !mv) redirect("/dashboard");
  const sb = await supabaseServer();
  const accId = Number(sp.acc || 0) || null;
  let mq = sb.from("money_moves").select("id,no,account_id,amount,kind,ref,note,by,at,transfer_id,reverses").order("id", { ascending: false }).limit(200);
  if (accId) mq = mq.eq("account_id", accId);
  const [{ data: list, error }, { data: locs }, { data: moves }, { data: people }] = await Promise.all([
    sb.rpc("money_accounts_list"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop", "warehouse", "factory"]).order("sort"),
    view ? mq : Promise.resolve({ data: [] }),
    sb.from("profiles").select("id,name"),
  ]);
  const A = (list ?? []) as Acc[];
  const AN = new Map(A.map((a) => [a.id, a]));
  const P = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const M_ = (moves ?? []) as M[];
  const reversed = new Set(M_.filter((m) => m.reverses).map((m) => m.reverses as number));
  const revTr = new Set(M_.filter((m) => m.kind === "reverse" && m.transfer_id).map((m) => m.transfer_id as number));
  const total = A.filter((a) => a.active).reduce((s, a) => s + Number(a.balance ?? 0), 0);
  const cur = accId ? AN.get(accId) : null;
  return (
    <>
      <div className="top"><h1>الخزن والحسابات</h1>{view && <span className="pill num" style={{ fontSize: 15 }}>الإجمالي {f2(total)} ج</span>}</div>
      {error && <div className="badmsg">{error.message}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10, marginBottom: 12 }}>
        {A.map((a) => (
          <div key={a.id} className="card" style={{ margin: 0, display: "grid", gap: 4, opacity: a.active ? 1 : 0.55, border: accId === a.id ? "2px solid var(--y)" : undefined }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b>{KINDS[a.kind]?.ic} {a.code}</b>
              {!a.active && <span className="pill" style={{ fontSize: 11 }}>مقفولة</span>}
            </div>
            <div style={{ fontSize: 13.5 }}>{a.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>{KINDS[a.kind]?.label}{a.number ? <> · <span dir="ltr">{a.number}</span></> : null}{a.loc_name ? ` · ${a.loc_name}` : ""}{a.fee_pct || a.fee_fixed ? ` · عمولة ${a.fee_pct ? `${a.fee_pct}%` : ""}${a.fee_pct && a.fee_fixed ? " + " : ""}${a.fee_fixed ? `${a.fee_fixed} ج` : ""}` : ""}</div>
            {a.balance != null && <b className="num" style={{ fontSize: 22, color: Number(a.balance) < 0 ? "var(--bad)" : undefined }}>{f2(Number(a.balance))} ج</b>}
            <div className="row" style={{ gap: 6 }}>
              {view && <Link className="btn" href={`/accounts/money?acc=${a.id}`} style={{ height: 30, display: "inline-grid", placeItems: "center" }}>كشف الحركة</Link>}
              {man && <EditAccount acc={a} locs={(locs ?? []) as { id: string; name: string }[]} />}
            </div>
          </div>))}
        {!A.length && <div className="card muted" style={{ margin: 0 }}>لسه مفيش خزن — افتح أول واحدة تحت.</div>}
      </div>

      <MoveForms accs={A} canMove={mv} />

      {man && (
        <details className="card" open={!A.length || sp.new === "1"}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ خزنة / حساب جديد</summary>
          <div style={{ marginTop: 10 }}><AccountForm locs={(locs ?? []) as { id: string; name: string }[]} /></div>
          <div className="note" style={{ marginTop: 8 }}>أي مكان فيه فلوس يبقى خزنة هنا: الخزنة الرئيسية، خزنة كل فرع، حساب البنك، محفظة فودافون كاش، إنستاباي، كل ماكينة فيزا لوحدها، Paymob، فوري… الكود الداخلي اسم مختصر بيظهر في كل مكان ومايتكررش، والعمولة بتتقترح لوحدها وانت بتحوّل من الخزنة دي (زي تسوية ماكينة الفيزا للبنك).</div>
        </details>
      )}

      {view && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>كشف الحركة {cur ? `— ${cur.code}` : "(كل الخزن)"}</h2>
            {cur && <Link className="btn" href="/accounts/money" style={{ height: 30, display: "inline-grid", placeItems: "center" }}>كل الخزن</Link>}
          </div>
          <table>
            <thead><tr><th>#</th><th>الوقت</th>{!cur && <th>الخزنة</th>}<th>الحركة</th><th>المبلغ</th><th>البيان</th><th>مين</th>{man && <th></th>}</tr></thead>
            <tbody>{M_.map((m) => (
              <tr key={m.id} style={reversed.has(m.id) || (m.transfer_id && revTr.has(m.transfer_id) && m.kind !== "reverse") ? { textDecoration: "line-through", opacity: 0.6 } : undefined}>
                <td className="num">{m.no}</td>
                <td className="num" style={{ fontSize: 12.5 }}>{new Date(m.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Cairo" })}</td>
                {!cur && <td>{AN.get(m.account_id)?.code}</td>}
                <td>{MK[m.kind] ?? m.kind}{m.ref ? <span className="muted" style={{ fontSize: 12 }}> · {m.ref}</span> : null}</td>
                <td className="num" style={{ fontWeight: 700, color: m.amount < 0 ? "var(--bad)" : "var(--good)" }} dir="ltr">{m.amount > 0 ? "+" : ""}{f2(m.amount)}</td>
                <td style={{ fontSize: 13 }}>{m.note}</td>
                <td style={{ fontSize: 13 }}>{m.by ? P.get(m.by) ?? "—" : "—"}</td>
                {man && <td>{m.kind !== "reverse" && m.kind !== "opening" && !reversed.has(m.id) && !(m.transfer_id && revTr.has(m.transfer_id)) && (m.kind !== "transfer_in") && <ReverseBtn id={m.id} />}</td>}
              </tr>))}
              {!M_.length && <tr><td colSpan={8} className="muted">لسه مفيش حركة</td></tr>}
            </tbody>
          </table>
          <div className="note" style={{ marginTop: 8 }}>الحركة مابتتمسحش: لو فيه غلط «اعكس» بيسجّل حركة عكسها بالسبب، والأصل بيفضل في الكشف متشطّب.</div>
        </div>
      )}
    </>
  );
}
