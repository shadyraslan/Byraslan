import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import { saveRules } from "../pay-actions";

type Pay = { divisor: number; day_hours: number; grace_min: number; late_tiers: { from: number; to: number; days: number }[]; absence_days: number; ot_rate: number; ot_min: number; ins_pct: number; tax_exempt: number; tax_brackets: [number | null, number][]; tax_lose: [number, number][]; shortage_to_payroll: boolean; early_grace?: number; early_tiers?: { from: number; to: number; days: number }[]; holiday_extra_days?: number; rest_extra_days?: number; go_live?: string };

export default async function Rules({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "settings.edit")) redirect("/hr");
  const sb = await supabaseServer();
  const { data } = await sb.from("settings").select("key,value").in("key", ["hr.payroll", "hr.leave", "hr.custody", "hr.advance", "hr.shifts", "hr.permits", "hr.staff_credit"]);
  const g = (k: string) => (data ?? []).find((s) => s.key === k)?.value ?? {};
  const p = g("hr.payroll") as Pay; const lv = g("hr.leave") as Record<string, number>; const cu = g("hr.custody") as Record<string, number>; const ad = g("hr.advance") as Record<string, number>;
  const sh = g("hr.shifts") as { cutoff?: string; notify?: boolean }; const pm = g("hr.permits") as Record<string, number>; const sc = g("hr.staff_credit") as { on?: boolean; limit_month?: number; discount_pct?: number };
  const F = ({ n, l, v, w = 90 }: { n: string; l: string; v: unknown; w?: number }) => <label className="fld">{l}<input name={n} defaultValue={String(v ?? "")} inputMode="decimal" dir="ltr" style={{ width: w }} /></label>;
  return (
    <>
      <div className="top"><h1>اللايحة والأرصدة</h1></div>
      <Tabs cur="/hr/rules" />
      <Flash sp={sp} />
      <form action={saveRules}>
        <div className="card">
          <h2>الحضور والمرتب</h2>
          <div className="row">
            <label className="fld">بداية الحساب على السيستم (فاضي = أول حضور لكل موظف)<input type="date" name="go_live" defaultValue={p.go_live ?? ""} /></label>
            <F n="divisor" l="اليوم = المرتب ÷" v={p.divisor} />
            <F n="day_hours" l="ساعات اليوم" v={p.day_hours} />
            <F n="grace" l="سماح التأخير (دقيقة)" v={p.grace_min} />
            <F n="absence" l="يوم الغياب من غير إذن = كام يوم خصم" v={p.absence_days} />
            <F n="ot_rate" l="معامل الإضافي" v={p.ot_rate} />
            <F n="ot_min" l="الإضافي بيتحسب من (دقيقة)" v={p.ot_min} />
          </div>
          <label className="fld">شرايح خصم التأخير — كل سطر: من-لحد دقيقة = كام يوم
            <textarea name="tiers" rows={4} dir="ltr" defaultValue={(p.late_tiers ?? []).map((t) => `${t.from}-${t.to}=${t.days}`).join("\n")} style={{ maxWidth: 260 }} />
          </label>
          <div className="row">
            <F n="early_grace" l="سماح الانصراف البدري (دقيقة)" v={p.early_grace ?? 10} />
            <F n="hol_extra" l="الشغل في إجازة رسمية = كام يوم زيادة" v={p.holiday_extra_days ?? 1} />
            <F n="rest_extra" l="الشغل في يوم الراحة = كام يوم زيادة" v={p.rest_extra_days ?? 1} />
          </div>
          <label className="fld">شرايح خصم الانصراف البدري — كل سطر: من-لحد دقيقة = كام يوم
            <textarea name="early_tiers" rows={3} dir="ltr" defaultValue={(p.early_tiers ?? []).map((t) => `${t.from}-${t.to}=${t.days}`).join("\n")} style={{ maxWidth: 260 }} />
          </label>
          <label className="row" style={{ gap: 8, marginTop: 8 }}><input type="checkbox" name="short" defaultChecked={p.shortage_to_payroll !== false} style={{ width: 22, height: 22 }} /> عجز العهدة يتخصم من المرتب لوحده</label>
        </div>
        <div className="card">
          <h2>التأمينات والضريبة</h2>
          <div className="badmsg" style={{ marginBottom: 8 }}>الأرقام دي مبدئية — لازم المحاسب القانوني يراجعها قبل أول مرتب حقيقي.</div>
          <div className="row">
            <F n="ins_pct" l="حصة الموظف في التأمينات %" v={p.ins_pct} />
            <F n="tax_exempt" l="الإعفاء الشخصي في السنة" v={p.tax_exempt} w={110} />
          </div>
          <div className="row">
            <label className="fld">شرايح الضريبة السنوية — كل سطر: لحد = النسبة (والأخير: فوق = النسبة)
              <textarea name="brackets" rows={7} dir="ltr" defaultValue={(p.tax_brackets ?? []).map(([u, r]) => `${u ?? "فوق"}=${r}`).join("\n")} style={{ width: 240 }} />
            </label>
            <label className="fld">خسارة الشرايح للدخل العالي — كل سطر: الدخل فوق = بيخسر كام شريحة
              <textarea name="lose" rows={6} dir="ltr" defaultValue={(p.tax_lose ?? []).map(([u, n]) => `${u}=${n}`).join("\n")} style={{ width: 240 }} />
            </label>
          </div>
        </div>
        <div className="card">
          <h2>الإجازات والسلف والعهدة</h2>
          <div className="row">
            <F n="annual" l="السنوية (يوم)" v={lv.annual} />
            <F n="first_year" l="أول سنة (يوم)" v={lv.first_year} />
            <F n="casual" l="منها عارضة (يوم)" v={lv.casual} />
            <F n="sick" l="المرضي بيتدفع %" v={lv.sick_pay_pct} />
            <F n="max_salaries" l="أقصى سلفة = كام مرتب" v={ad.max_salaries} />
            <F n="max_inst" l="أقصى عدد أقساط" v={ad.max_installments} />
            <F n="spend_limit" l="مصروف العهدة من غير موافقة لحد (ج)" v={cu.spend_limit} />
          </div>
          <div className="muted">السلفة فوق "كام مرتب" محتاجة المالك. حد موافقة كل مدير على السلف والعهد والمكافآت بيتحدد من صلاحياته في شاشة الموظفين.</div>
        </div>
        <div className="card">
          <h2>الورديات والأذون ومشتريات الموظفين</h2>
          <div className="row" style={{ alignItems: "end" }}>
            <label className="fld">وردية اليوم تتحدد لحد الساعة (يوم قبلها)<input type="time" name="cutoff" defaultValue={sh.cutoff ?? "20:00"} /></label>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="notify" defaultChecked={sh.notify !== false} style={{ width: 20, height: 20 }} /> إشعار وردية بكره لكل موظف</label>
            <F n="max_permits" l="أقصى أذون مدفوعة في الشهر (0 = مفتوح)" v={pm.max_paid_month ?? 0} />
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="credit_on" defaultChecked={sc.on !== false} style={{ width: 20, height: 20 }} /> البيع للموظفين بالآجل</label>
            <F n="credit_limit" l="حد الآجل لكل موظف في الشهر (ج)" v={sc.limit_month ?? 2000} />
            <F n="credit_disc" l="خصم الموظفين على المشتريات %" v={sc.discount_pct ?? 0} />
          </div>
        </div>
        <button className="btn pri" style={{ marginBottom: 24 }}>احفظ اللايحة</button>
      </form>
    </>
  );
}
