import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import Selfie from "../Selfie";
import DocReady from "./DocReady";
import { DOC_KINDS } from "@/lib/hrdocs";
import { disputeDecide, docDecide } from "../pay-actions";

const DS: Record<string, string> = { pending: "مستني", ready: "جاهزة", delivered: "اتسلّمت", rejected: "اترفضت" };
const d = (s: string) => new Date(s).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" });

export default async function Requests({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "hr.pay") && !can(me, "hr.docs")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: disp }, { data: docs }, { data: people }] = await Promise.all([
    can(me, "hr.pay") ? sb.from("payslip_disputes").select("*, payslips(run_id, payroll_runs(month)), payslip_lines(label, amount, reason)").order("id", { ascending: false }).limit(100) : Promise.resolve({ data: [] }),
    can(me, "hr.docs") ? sb.from("doc_requests").select("*").order("id", { ascending: false }).limit(150) : Promise.resolve({ data: [] }),
    sb.from("profiles").select("id,name"),
  ]);
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  type Dp = { id: number; user_id: string; text: string; status: string; amount: number | null; reply: string | null; at: string; payslips: { payroll_runs: { month: string } | null } | null; payslip_lines: { label: string; amount: number; reason: string | null } | null };
  type Dr = { id: number; no: number; user_id: string; kind: string; addressed_to: string | null; purpose: string | null; note: string | null; status: string; reply: string | null; file: string | null; at: string };
  const D = (disp ?? []) as unknown as Dp[];
  const R = (docs ?? []) as Dr[];
  return (
    <>
      <div className="top"><h1>الاعتراضات والأوراق</h1></div>
      <Tabs cur="/hr/requests" />
      <Flash sp={sp} />
      {can(me, "hr.pay") && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2>اعتراضات على المرتبات ({D.filter((x) => x.status === "open").length} مستني)</h2>
          <table><tbody>{D.map((x) => (
            <tr key={x.id}>
              <td><b>{PN.get(x.user_id)}</b><div className="muted">{x.payslips?.payroll_runs?.month?.slice(0, 7)} · {d(x.at)}</div></td>
              <td>{x.payslip_lines ? <><b>{x.payslip_lines.label}</b> <span className="num">{Math.round(x.payslip_lines.amount)}</span><div className="muted" style={{ fontSize: 12 }}>{x.payslip_lines.reason}</div></> : "المرتب كله"}</td>
              <td style={{ whiteSpace: "normal", maxWidth: 260 }}>«{x.text}»</td>
              <td>{x.status === "open" ? (
                <form action={disputeDecide} className="row" style={{ gap: 4 }}>
                  <input type="hidden" name="id" value={x.id} />
                  <input name="reply" placeholder="الرد (إجباري)" required style={{ width: 180, height: 32 }} />
                  <input name="amount" placeholder="تسوية ج" inputMode="decimal" dir="ltr" style={{ width: 80, height: 32 }} />
                  <button name="ok" value="1" className="btn pri" style={{ height: 32 }}>اقبل</button>
                  <button name="ok" value="0" className="btn" style={{ height: 32 }}>ارفض</button>
                </form>
              ) : <span>{x.status === "accepted" ? `اتقبل${x.amount ? ` · تسوية ${x.amount} ج الشهر الجاي` : ""}` : "اترفض"}<div className="muted">{x.reply}</div></span>}</td>
            </tr>
          ))}</tbody></table>
          {!D.length && <div className="muted">مفيش اعتراضات</div>}
          <div className="muted">القبول بمبلغ بينزل تسوية لوحده في أول شهر لسه مااتعتمدش، والموظف بيوصله الرد إشعار.</div>
        </div>
      )}
      {can(me, "hr.docs") && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2>طلبات الأوراق ({R.filter((x) => x.status === "pending").length} مستني)</h2>
          <table><tbody>{R.map((x) => (
            <tr key={x.id}>
              <td className="num">#{x.no}</td>
              <td><b>{PN.get(x.user_id)}</b><div className="muted">{d(x.at)}</div></td>
              <td><b>{DOC_KINDS[x.kind]}</b>{x.addressed_to && <div>لـ {x.addressed_to}</div>}{x.purpose && <div className="muted">الغرض: {x.purpose}</div>}{x.note && <div className="muted">{x.note}</div>}</td>
              <td>{x.status === "pending" ? <DocReady id={x.id} user={x.user_id} /> : (
                <div className="row" style={{ gap: 6, alignItems: "center" }}>
                  <b>{DS[x.status]}</b>{x.reply && <span className="muted">{x.reply}</span>}
                  {x.status !== "rejected" && ["salary_cert", "employment_cert", "salary_details", "experience"].includes(x.kind) && <Link className="btn" style={{ height: 32, display: "inline-grid", placeItems: "center" }} href={`/print/doc/${x.id}`} target="_blank">🖨️ اطبع</Link>}
                  {x.file && <Selfie path={x.file} label="📎 النسخة" link />}
                  {x.status === "ready" && <form action={docDecide}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="status" value="delivered" /><button className="btn" style={{ height: 32 }}>اتسلّمت</button></form>}
                </div>
              )}</td>
            </tr>
          ))}</tbody></table>
          {!R.length && <div className="muted">مفيش طلبات</div>}
          <div className="muted">بعد "جاهزة": الشهادة بتطلع للطباعة بأرقام آخر مرتب معتمد وعليها كود QR — أي جهة تمسحه تتأكد إنها سليمة. اختمها وسلّمها.</div>
        </div>
      )}
    </>
  );
}
