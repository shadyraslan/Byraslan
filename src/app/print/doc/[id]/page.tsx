import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { DOC_KINDS } from "@/lib/hrdocs";
import Qr from "./Qr";
import PrintBtn from "./PrintBtn";

type Issued = { name: string; job: string | null; loc: string | null; hire_date: string | null; base: number | null; allowances: number | null; pay_type: string | null; insurance_wage: number | null; last: { month: string; gross: number; net: number } | null };
const money = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(Number(n)).toLocaleString("en")} جنيه`);
const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }) : "—");

/** شهادة جاهزة للطباعة من آخر مرتب معتمد، وعليها كود تحقق */
export default async function PrintDoc({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!can(me, "hr.docs")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: r } = await sb.from("doc_requests").select("*").eq("id", Number(id)).maybeSingle();
  if (!r || !r.issued) return <div style={{ padding: 40 }}>دوس "جاهزة" على الطلب الأول عشان الشهادة تطلع بأرقامها.</div>;
  const x = r.issued as Issued;
  const h = await headers();
  const url = `https://${h.get("x-forwarded-host") ?? h.get("host")}/v/${r.code}`;
  const salary = r.kind === "salary_cert" || r.kind === "salary_details";
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 40px", background: "#fff", color: "#111", minHeight: "100vh", fontSize: 17, lineHeight: 2 }}>
      <PrintBtn />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #FFC400", paddingBottom: 12 }}>
        <div><div style={{ fontSize: 26, fontWeight: 900 }}>باي رسلان</div><div style={{ color: "#666", fontSize: 13 }}>By Raslan</div></div>
        <div style={{ textAlign: "left", fontSize: 13, color: "#444" }}>رقم: {r.no}<br />التاريخ: {dt(r.decided_at)}</div>
      </div>
      <h1 style={{ textAlign: "center", margin: "36px 0 24px", fontSize: 26 }}>{DOC_KINDS[r.kind]}</h1>
      {r.addressed_to && <p><b>السادة / {r.addressed_to}</b><br />تحية طيبة وبعد،</p>}
      <p>
        تشهد شركة باي رسلان بأن السيد/ة <b>{x.name}</b> يعمل لديها بوظيفة <b>{x.job ?? "—"}</b>{x.loc ? <> في <b>{x.loc}</b></> : null}،
        وذلك اعتباراً من <b>{dt(x.hire_date)}</b> وحتى تاريخه{r.kind === "experience" ? "، وكان مثالاً للالتزام وحسن الأداء" : ""}.
      </p>
      {salary && (
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0" }}>
          <tbody>
            {[["الأجر الأساسي", money(x.base)], ["البدلات", money(x.allowances)], ["إجمالي آخر مرتب" + (x.last ? ` (${x.last.month})` : ""), money(x.last?.gross)], ["صافي آخر مرتب", money(x.last?.net)], ["الأجر التأميني", money(x.insurance_wage)]].map(([k, v]) => (
              <tr key={k}><td style={{ border: "1px solid #ccc", padding: "6px 12px", background: "#fafafa", width: "45%" }}>{k}</td><td style={{ border: "1px solid #ccc", padding: "6px 12px", fontWeight: 700 }}>{v}</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p>وقد أُعطيت هذه الشهادة بناءً على طلبه{r.purpose ? ` لتقديمها لغرض: ${r.purpose}` : " لتقديمها لمن يهمه الأمر"}، دون أدنى مسؤولية على الشركة.</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginTop: 56 }}>
        <div style={{ textAlign: "center" }}><div>مدير الموارد البشرية</div><div style={{ marginTop: 48, borderTop: "1px solid #999", width: 200 }}>التوقيع والختم</div></div>
        <div style={{ textAlign: "center", fontSize: 12, color: "#555" }}><Qr value={url} /><div>امسح للتأكد من صحة الشهادة</div></div>
      </div>
    </div>
  );
}
