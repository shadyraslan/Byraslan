import { supabaseServer } from "@/lib/supabase/server";
import { DOC_KINDS } from "@/lib/hrdocs";

type V = { no: number; kind: string; to: string | null; at: string; name: string; job: string | null; hire_date: string | null; gross: string | null; month: string | null };
const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" }) : "—");

/** صفحة عامة: أي جهة تمسح QR الشهادة تتأكد إنها طالعة فعلاً من باي رسلان */
export default async function Verify({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("public_doc_verify", { p_code: code.slice(0, 40) });
  const v = data as V | null;
  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 24, fontFamily: "Cairo, sans-serif", direction: "rtl" }}>
      <div style={{ background: "#111", color: "#FFC400", padding: "14px 18px", borderRadius: 14, fontWeight: 900, fontSize: 20 }}>باي رسلان — التحقق من الشهادات</div>
      {v ? (
        <div style={{ border: "2px solid #1a8f4a", borderRadius: 14, padding: 18, marginTop: 16, lineHeight: 2 }}>
          <div style={{ color: "#1a8f4a", fontWeight: 900, fontSize: 18 }}>✓ الشهادة سليمة وطالعة من الشركة</div>
          <div>النوع: <b>{DOC_KINDS[v.kind]}</b> · رقم {v.no}</div>
          <div>الاسم: <b>{v.name}</b></div>
          <div>الوظيفة: <b>{v.job ?? "—"}</b> · من {dt(v.hire_date)}</div>
          {v.gross && <div>إجمالي آخر مرتب{v.month ? ` (${v.month})` : ""}: <b>{Math.round(Number(v.gross)).toLocaleString("en")} جنيه</b></div>}
          {v.to && <div>موجّهة لـ: {v.to}</div>}
          <div>تاريخ الإصدار: {dt(v.at)}</div>
        </div>
      ) : (
        <div style={{ border: "2px solid #c62828", borderRadius: 14, padding: 18, marginTop: 16, color: "#c62828", fontWeight: 800 }}>الكود ده مش لشهادة صادرة من باي رسلان.</div>
      )}
    </div>
  );
}
