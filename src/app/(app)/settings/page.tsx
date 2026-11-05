import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

async function save(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const fees: Record<string, number> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("fee:") && String(v).trim() !== "") fees[k.slice(4)] = Number(v);
  const rows = [
    { key: "online.open", value: fd.get("open") === "on" },
    { key: "online.min_order", value: Number(fd.get("min") || 0) },
    { key: "online.late_minutes", value: Number(fd.get("late") || 45) },
    { key: "online.delivery_fee", value: fees },
    { key: "online.weight_note", value: String(fd.get("note") || "") },
  ];
  await sb.from("settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
  revalidatePath("/settings");
}

export default async function Settings() {
  const me = await getMe();
  if (!can(me, "settings.edit")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: S }, { data: locs }] = await Promise.all([
    sb.from("settings").select("key,value").like("key", "online.%"),
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
  ]);
  const g = (k: string) => (S ?? []).find((s) => s.key === k)?.value;
  const fees = (g("online.delivery_fee") ?? {}) as Record<string, number>;
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
        <div className="row">{(locs ?? []).map((l) => <label key={l.id} className="fld">توصيل {l.name}<input name={`fee:${l.id}`} defaultValue={fees[l.id as string] ?? ""} inputMode="numeric" dir="ltr" /></label>)}</div>
        <label className="fld" style={{ display: "grid" }}>ملاحظة الوزن للعميل<input name="note" defaultValue={String(g("online.weight_note") ?? "")} /></label>
        <div className="muted" style={{ fontSize: 13 }}>لينك صفحة الطلب للعملاء: <b dir="ltr">byraslan.vercel.app/order</b> — الأسعار من شاشة أسعار الفروع (عمود التطبيق)</div>
        <button className="btn pri" style={{ marginTop: 8 }}>حفظ</button>
      </form>
    </>
  );
}
