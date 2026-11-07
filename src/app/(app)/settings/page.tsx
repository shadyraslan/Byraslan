import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can, need } from "@/lib/perms";

async function save(fd: FormData) {
  "use server";
  await need("settings.edit");
  const sb = await supabaseServer();
  const rows = [
    { key: "online.open", value: fd.get("open") === "on" },
    { key: "online.min_order", value: Number(fd.get("min") || 0) },
    { key: "online.late_minutes", value: Number(fd.get("late") || 45) },
    { key: "online.weight_note", value: String(fd.get("note") || "") },
    { key: "app.test_mode", value: fd.get("test") === "on" },
    { key: "stock.count", value: { blind: fd.get("cblind") === "on", reason_over: Math.max(Number(fd.get("creason") || 0), 0) } },
    { key: "limits.orders_per_hour", value: Math.max(Number(fd.get("oph") ?? 10), 0) },
    { key: "auth.pin_min", value: Math.max(Number(fd.get("pinmin") || 6), 4) },
    { key: "pos.refresh_minutes", value: Math.max(Number(fd.get("posmin") || 1), 0.25) },
    { key: "online.offline_reroute_minutes", value: Math.max(Number(fd.get("reroute") || 0), 0) },
    { key: "scale_barcode", value: {
      prefix: String(fd.get("sc_prefix") || "20").trim(), plu_digits: Number(fd.get("sc_plu") || 5), weight_digits: Number(fd.get("sc_w") || 5),
      decimals: Number(fd.get("sc_dec") || 3), type: String(fd.get("sc_type") || "weight"), double_read_sec: 1 } },
    { key: "app.support", value: {
      whatsapp: String(fd.get("wa") || "").trim(), phone: String(fd.get("phone") || "").trim(), hours: String(fd.get("hours") || "").trim(),
      faq: String(fd.get("faq") || "").split(/\n/).map((l) => l.split("|").map((x) => x.trim())).filter((x) => x[0] && x[1]).map((x) => [x[0], x.slice(1).join(" | ")]) } },
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
        <h2 style={{ marginTop: 14 }}>باركود الميزان</h2>
        {(() => { const sc = (g("scale_barcode") ?? {}) as { prefix?: string; plu_digits?: number; weight_digits?: number; decimals?: number; type?: string }; return (
          <>
            <div className="row">
              <label className="fld">بيبدأ بـ<input name="sc_prefix" defaultValue={sc.prefix ?? "20"} dir="ltr" style={{ width: 70 }} /></label>
              <label className="fld">أرقام كود الصنف<input name="sc_plu" defaultValue={sc.plu_digits ?? 5} dir="ltr" style={{ width: 70 }} /></label>
              <label className="fld">الملصق فيه<select name="sc_type" defaultValue={sc.type ?? "weight"}><option value="weight">الوزن</option><option value="price">السعر</option></select></label>
              <label className="fld">أرقام الوزن/السعر<input name="sc_w" defaultValue={sc.weight_digits ?? 5} dir="ltr" style={{ width: 70 }} /></label>
              <label className="fld">منهم عشري<input name="sc_dec" defaultValue={sc.decimals ?? 3} dir="ltr" style={{ width: 70 }} /></label>
            </div>
            <div className="muted" style={{ fontSize: 13 }}>مثال بالإعدادات دي: <b dir="ltr">{sc.prefix ?? "20"}{"0".repeat(Math.max((sc.plu_digits ?? 5) - 3, 0))}123{"0".repeat(Math.max((sc.weight_digits ?? 5) - 4, 0))}1250X</b> = صنف كود 123 و{(sc.type ?? "weight") === "price" ? "سعر" : "وزن"} {1250 / 10 ** (sc.decimals ?? 3)}. كود الصنف على الميزان بيتكتب في الصنف (كود الميزان).</div>
          </>
        ); })()}
        <h2 style={{ marginTop: 14 }}>خدمة العملاء (بتظهر في التطبيق)</h2>
        {(() => { const sp = (g("app.support") ?? {}) as { whatsapp?: string; phone?: string; hours?: string; faq?: [string, string][] }; return (
          <>
            <div className="row">
              <label className="fld">واتساب<input name="wa" defaultValue={sp.whatsapp ?? ""} placeholder="201000000000" dir="ltr" /></label>
              <label className="fld">تليفون<input name="phone" defaultValue={sp.phone ?? ""} placeholder="19xxx" dir="ltr" /></label>
              <label className="fld">المواعيد<input name="hours" defaultValue={sp.hours ?? ""} placeholder="كل يوم 9ص – 11م" /></label>
            </div>
            <label className="fld" style={{ display: "grid" }}>الأسئلة المتكررة — كل سطر: السؤال | الإجابة
              <textarea name="faq" rows={5} defaultValue={(sp.faq ?? []).map((x) => `${x[0]} | ${x[1]}`).join("\n")} />
            </label>
          </>
        ); })()}
        <h2 style={{ marginTop: 14 }}>تطبيق العميل</h2>
        <label className="row" style={{ gap: 8, color: g("app.test_mode") === true ? "var(--bad)" : undefined }}><input type="checkbox" name="test" defaultChecked={g("app.test_mode") === true} style={{ width: 22, height: 22 }} /> وضع التجربة: الدخول بأي رقم من غير كود SMS — <b>لازم يتقفل قبل ما التطبيق ينزل للناس</b></label>
        <h2 style={{ marginTop: 14 }}>الجرد</h2>
        <div className="row">
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="cblind" defaultChecked={(g("stock.count") as { blind?: boolean } | undefined)?.blind !== false} /> جرد أعمى (اللي بيعدّ مايشوفش رصيد السيستم)</label>
          <label className="fld">الفرق اللي يستاهل سبب (ج، 0 = مش لازم)<input name="creason" type="number" min={0} defaultValue={Number((g("stock.count") as { reason_over?: number } | undefined)?.reason_over ?? 0)} /></label>
        </div>
        <h2 style={{ marginTop: 14 }}>الأمان</h2>
        <div className="row">
          <label className="fld">أقصى عدد طلبات من نفس الرقم في الساعة (0 = من غير حد)<input name="oph" type="number" min={0} defaultValue={Number(g("limits.orders_per_hour") ?? 10)} /></label>
          <label className="fld">أقل عدد أرقام للرقم السري بتاع الموظفين<input name="pinmin" type="number" min={4} defaultValue={Number(g("auth.pin_min") ?? 6)} /></label>
        </div>
        <button className="btn pri" style={{ marginTop: 8 }}>حفظ</button>
      </form>
    </>
  );
}
