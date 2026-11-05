import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Refresh from "./Refresh";

const STEPS: [string, string][] = [["new", "وصلنا طلبك"], ["accepted", "اتقبل"], ["preparing", "بيتحضّر"], ["ready", "جاهز"], ["out", "مع الطيار"], ["delivered", "اتسلّم"]];
type T = { no: number; status: string; branch: string; est_total: number; total: number | null; fee: number; cancel_reason: string | null; lines: { name: string; unit: string; qty: number; prepared: number; price: number }[] };

export default async function Track({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("track_order", { p_token: token });
  if (!data) notFound();
  const o = data as T;
  const idx = STEPS.findIndex(([k]) => k === o.status);
  const final = o.total != null;
  const lineTotal = (l: T["lines"][number]) => (l.prepared > 0 ? l.prepared : l.qty) * l.price;
  const sub = o.lines.reduce((a, l) => a + lineTotal(l), 0);
  return (
    <div className="shop">
      <header className="shophead"><img src="/logo.png" alt="By Raslan" /><b>طلب رقم {o.no}</b></header>
      <div className="shopbody">
        {o.status !== "delivered" && o.status !== "cancelled" && <Refresh />}
        {o.status === "cancelled" ? <div className="badmsg">الطلب اتلغى {o.cancel_reason ? `— ${o.cancel_reason}` : ""}</div> : (
          <div className="steps">{STEPS.map(([k, l], i) => <div key={k} className={i <= idx ? "on" : ""}><span>{i + 1}</span>{l}</div>)}</div>
        )}
        <div className="card">
          <div className="muted">فرع {o.branch}</div>
          {o.lines.map((l, i) => <div key={i} className="row" style={{ justifyContent: "space-between" }}><span>{l.name} <span className="num">{l.prepared > 0 ? l.prepared : l.qty} {l.unit}</span></span><b className="num">{Math.round(lineTotal(l))}</b></div>)}
          <div className="row" style={{ justifyContent: "space-between" }}><span>التوصيل</span><b className="num">{o.fee}</b></div>
          <div className="row" style={{ justifyContent: "space-between", fontSize: 18 }}><span>{final ? "الإجمالي" : "الإجمالي (تقريبي لحد الوزن)"}</span><b className="num">{Math.round(final ? Number(o.total) : sub + Number(o.fee))} ج</b></div>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>احفظ اللينك ده عشان تتابع طلبك</div>
      </div>
    </div>
  );
}
