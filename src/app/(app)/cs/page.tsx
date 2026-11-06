import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Inbox from "./Inbox";
import { saveCsSettings } from "./actions";

export default async function Cs({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "cs.agent") && !can(me, "cs.manage")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: S }, { data: agents }] = await Promise.all([
    sb.from("settings").select("key,value").in("key", ["cs.canned", "cs.sla_minutes", "app.support"]),
    sb.from("profiles").select("id,name").eq("active", true).order("name"),
  ]);
  const g = (k: string) => (S ?? []).find((s) => s.key === k)?.value;
  const canned = (g("cs.canned") ?? []) as string[];
  const sla = Number(g("cs.sla_minutes") ?? 15);
  const site = "https://byraslan.vercel.app";
  const greet = `أهلاً بيك في باي رسلان 👋\nاطلب من هنا: ${site}/order\nتابع طلبك أو كلّم خدمة العملاء: ${site}/help\nأو اكتب طلبك هنا وهنسجّله لك.`;
  return (
    <>
      <div className="top"><h1>خدمة العملاء</h1><a className="btn pri" href="/cs/new" style={{ display: "inline-grid", placeItems: "center" }}>+ طلب واتساب / تليفون</a></div>
      <Inbox me={me!.id} canned={canned} sla={sla} agents={(agents ?? []) as { id: string; name: string }[]} manage={can(me, "cs.manage")} openId={sp.t ? Number(sp.t) : null} />
      {can(me, "cs.manage") && (
        <form action={saveCsSettings} className="card">
          <h2>إعدادات خدمة العملاء</h2>
          <label className="fld">التذكرة تبقى متأخرة لو مااترددش عليها خلال (دقيقة)<input name="sla" defaultValue={sla} dir="ltr" style={{ width: 90 }} /></label>
          <label className="fld" style={{ display: "grid" }}>الردود الجاهزة — كل سطر رد<textarea name="canned" rows={6} defaultValue={canned.join("\n")} /></label>
          <button className="btn pri">احفظ</button>
          <h2 style={{ marginTop: 16 }}>رسالة الترحيب في واتساب بيزنس (مجاني)</h2>
          <div className="muted">في تطبيق واتساب بيزنس: الإعدادات ← أدوات الأعمال ← رسالة الترحيب، والصق دي:</div>
          <textarea readOnly rows={5} defaultValue={greet} style={{ width: "100%" }} />
          <div className="muted">ورابط خدمة العملاء للتطبيق والويب: <b dir="ltr">{site}/help</b> — مفيش أي رسالة مدفوعة.</div>
        </form>
      )}
    </>
  );
}
