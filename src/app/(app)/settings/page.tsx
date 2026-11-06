import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

async function save(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const rows = [
    { key: "online.open", value: fd.get("open") === "on" },
    { key: "online.min_order", value: Number(fd.get("min") || 0) },
    { key: "online.late_minutes", value: Number(fd.get("late") || 45) },
    { key: "online.weight_note", value: String(fd.get("note") || "") },
    { key: "app.test_mode", value: fd.get("test") === "on" },
    { key: "pos.refresh_minutes", value: Math.max(Number(fd.get("posmin") || 1), 0.25) },
    { key: "online.offline_reroute_minutes", value: Math.max(Number(fd.get("reroute") || 0), 0) },
  ];
  await sb.from("settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  revalidatePath("/settings");
}

export default async function Settings() {
  const me = await getMe();
  if (!can(me, "settings.edit")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: S }] = await Promise.all([
    sb.from("settings").select("key,value"),
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
  ]);
  const g = (k: string) => (S ?? []).find((s) => s.key === k)?.value;
  return (
    <>
      <div className="top"><h1>الإعدادات</h1></div>
      <form action={save} className="card">
        <h2>الطلبات أونلاين</h2>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" name="open" defaultChecked={g("online.open") !== false} style={{ width: 22, height: 22 }} /> استقبال الطلبات مفتوح</label>
        <div className="row">
          <label className="fld">أقل طلب (ج)<input name="min" defaultValue={String(g("online.min_order") ?? 300)} inputMode="numeric" dir="ltr" /></label>
          <label className="fld">الطلب يبقى متأخر بعد (دقيقة)<input name="late" defaultValue={String(g("online.late_minutes") ?? 45)} inputMode="numeric" dir="ltr" /></label>
        </div>
        <div className="muted" style={{ fontSize: 13 }}>سعر التوصيل والفرع بيتحددوا من الحي في <a href="/zones"><b>مناطق التوصيل</b></a>.</div>
        <label className="fld" style={{ display: "grid" }}>ملاحظة الوزن للعميل<input name="note" defaultValue={String(g("online.weight_note") ?? "")} /></label>
        <div className="muted" style={{ fontSize: 13 }}>لينك صفحة الطلب للعملاء: <b dir="ltr">byraslan.vercel.app/order</b> — الأسعار من شاشة أسعار الفروع (عمود التطبيق)</div>
        <h2 style={{ marginTop: 14 }}>الكاشير</h2>
        <label className="fld">الكاشير يحدّث الأسعار والعلب كل (دقيقة)<input name="posmin" defaultValue={String(g("pos.refresh_minutes") ?? 1)} inputMode="decimal" dir="ltr" style={{ width: 100 }} /></label>
        <div className="muted" style={{ fontSize: 13 }}>ولو اتمسح كود مش موجود على الجهاز والنت شغال، بيسأل السيستم على طول.</div>
        <label className="fld">لو نت كاشير الفرع قطع أكتر من (دقيقة) طلبات الأونلاين الجديدة تروح للفرع الاحتياطي — 0 = مايتحوّلش<input name="reroute" defaultValue={String(g("online.offline_reroute_minutes") ?? 5)} inputMode="numeric" dir="ltr" style={{ width: 100 }} /></label>
        <h2 style={{ marginTop: 14 }}>تطبيق العميل</h2>
        <label className="row" style={{ gap: 8, color: g("app.test_mode") === true ? "var(--bad)" : undefined }}><input type="checkbox" name="test" defaultChecked={g("app.test_mode") === true} style={{ width: 22, height: 22 }} /> وضع التجربة: الدخول بأي رقم من غير كود SMS — <b>لازم يتقفل قبل ما التطبيق ينزل للناس</b></label>
        <button className="btn pri" style={{ marginTop: 8 }}>حفظ</button>
      </form>
    </>
  );
}
