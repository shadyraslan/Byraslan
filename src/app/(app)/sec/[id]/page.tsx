import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { NAV } from "@/lib/nav";
import Tile from "@/components/Tile";
import Icon from "@/components/Icon";
import Bars from "@/components/Bars";
import { money } from "@/lib/time";

type S = Record<string, unknown> & { series?: { d: string; v: number }[] };
const dl = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric" });
const CH: Record<string, string> = { app: "التطبيق", web: "الويب", whatsapp: "واتساب", phone: "تليفون" };

/** الصفحة الرئيسية لكل قسم: أيقونات شاشاته + أرقامه + رسم آخر 14 يوم */
export default async function Section({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const g0 = NAV.find((g) => g.id === id);
  if (!g0) notFound();
  const g = { ...g0, links: g0.links.filter((l) => !l.perms || l.perms.some((p) => can(me, p))) };
  const sb = await supabaseServer();
  const { data } = await sb.rpc("section_stats", { p_section: id });
  const s = (data ?? {}) as S;
  const n = (k: string) => Number(s[k] ?? 0);
  const K = ({ href, label, v, warn, sub }: { href?: string; label: string; v: string | number; warn?: boolean; sub?: string }) => {
    const inner = <><span>{label}</span><b className="num">{v}</b>{sub && <small>{sub}</small>}</>;
    const cls = `kpi${warn && Number(v) > 0 ? " hl" : ""}`;
    return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>;
  };
  const series = (s.series ?? []).map((x) => ({ label: dl(x.d), v: Number(x.v) }));
  const chart: Record<string, [string, string]> = {
    orders: ["الطلبات في آخر 14 يوم", " طلب"], cs: ["التذاكر الجديدة في آخر 14 يوم", " تذكرة"], branches: ["مبيعات الفروع في آخر 14 يوم", " ج"], factory: ["العلب اللي اتغلّفت في آخر 14 يوم", " علبة"],
    purchasing: ["قيمة الاستلامات في آخر 14 يوم", " ج"], accounts: ["المصروفات في آخر 14 يوم", " ج"], hr: ["الحضور في آخر 14 يوم", " موظف"], partner: ["أصناف الشريك اللي اتاخدت (بالتكلفة) آخر 14 يوم", " ج"],
  };
  return (
    <>
      <div className="sec-head" style={{ ["--c" as string]: g.color }}>
        <span className="ico"><Icon name={g.icon} size={28} /></span>
        <h1>{g.title}</h1>
      </div>

      <div className="kpis">
        {id === "cs" && <>
          <K href="/cs" label="عملاء مستنيين رد" v={n("waiting")} warn />
          <K href="/cs" label="متأخرين في الرد" v={n("late")} warn />
          <K href="/cs/orders" label="طلبات مفتوحة" v={n("orders_open")} />
          <K href="/cs/orders?scope=bookings" label="حجوزات النهارده" v={n("bookings_today")} />
          <K href="/complaints" label="شكاوى مفتوحة" v={n("complaints")} warn />
          <K href="/cs/orders?scope=all" label="طلبات واتساب وتليفون النهارده" v={n("phone_orders")} />
          <K href="/cs/orders" label="عناوين بعيدة عن الفرع" v={n("pin_far")} warn />
          {s.rating != null && <K label="تقييم الخدمة الشهر ده" v={`${s.rating} ★`} />}
        </>}
        {id === "orders" && <>
          <K href="/orders" label="طلبات مفتوحة دلوقتي" v={n("open")} warn />
          <K href="/orders" label="طلبات النهارده" v={n("today")} sub={`${money(n("today_value"))} ج`} />
          <K href="/bookings" label="حجوزات النهارده" v={n("bookings_today")} sub={`${n("bookings_next")} حجز جاي`} />
          <K href="/cs" label="عملاء مستنيين رد" v={n("tickets")} warn />
          <K href="/complaints" label="شكاوى مفتوحة" v={n("complaints")} warn />
        </>}
        {id === "branches" && <>
          <K href="/sales" label="مبيعات النهارده" v={`${money(n("today"))} ج`} sub={`${n("invoices")} فاتورة`} />
          <K href="/sales" label="مبيعات الشهر" v={`${money(n("month"))} ج`} />
          <K href="/sales" label="ورديات مفتوحة" v={n("open_shifts")} />
          <K href="/offers" label="عروض شغالة" v={n("promos")} />
        </>}
        {id === "factory" && <>
          <K href="/pack" label="علب اتغلّفت النهارده" v={n("packed")} />
          <K href="/production" label="أوامر إنتاج مفتوحة" v={n("prod_open")} />
          <K href="/transfers" label="تحويلات في الطريق" v={n("transit")} />
          <K href="/trips" label="رحلات مفتوحة" v={n("trips")} />
          <K href="/stock/count?s=submitted" label="جرد مستني اعتماد" v={n("counts_pending")} warn />
          <K href="/stock/count?s=open" label="جرد شغال" v={n("counts_open")} />
        </>}
        {id === "purchasing" && <>
          <K href="/purchasing" label="أوامر توريد مفتوحة" v={n("po_open")} />
          <K href="/purchasing" label="استلامات آخر 7 أيام" v={n("receipts_week")} />
          <K href="/overrides" label="تجاوزات مستنية" v={n("overrides")} warn />
          <K href="/purchasing/suppliers" label="الموردين" v={n("suppliers")} />
        </>}
        {id === "accounts" && <>
          <K href="/accounts" label="مبيعات الشهر" v={`${money(n("sales_month"))} ج`} />
          <K href="/accounts/expenses" label="مصروفات الشهر" v={`${money(n("exp_month"))} ج`} />
          <K href="/accounts/expenses" label="مصروفات مستنية موافقة" v={n("exp_pending")} warn />
          <K href="/accounts/suppliers" label="علينا للموردين" v={`${money(n("payables"))} ج`} />
        </>}
        {id === "items" && <>
          <K href="/items" label="أصناف شغالة" v={n("items")} />
          <K href="/items" label="العائلات" v={n("families")} />
          <K href="/prices" label="أصناف من غير سعر" v={n("no_price")} warn />
          <K href="/items" label="أصناف ماركت من غير باركود" v={n("no_barcode")} warn />
        </>}
        {id === "hr" && <>
          <K href="/hr" label="جوه دلوقتي" v={n("present")} sub={`من ${n("staff")} موظف`} />
          <K href="/hr" label="حضروا النهارده" v={n("came_today")} />
          <K href="/hr" label="حضور مستني موافقة" v={n("att_pending")} warn />
          <K href="/hr/leaves" label="إجازات وسلف مستنية" v={n("leaves_pending")} warn />
          <K href="/hr/shifts" label="أذون مستنية" v={n("permits_pending")} warn />
          <K href="/hr/requests" label="أوراق واعتراضات مستنية" v={n("docs_pending") + n("disputes")} warn />
          <K href="/hr/penalties" label="جزاءات لسه ماتأكّدتش" v={n("penalties_open")} warn />
          <K href="/hr/staffdocs" label="شهادات خلصت أو قرّبت" v={n("docs_bad")} warn />
          <K href="/hr/presence" label="تأكيد تواجد فايت النهارده" v={n("presence_missed")} warn />
          <K href="/hr/assets" label="عهد عينية مع الموظفين" v={n("assets_out")} />
        </>}
        {id === "partner" && <>
          <K href="/partner" label="ملفات مستنية اعتماد" v={n("drafts")} warn />
          <K href="/partner" label="أسعار محتاجة مراجعة" v={n("review")} warn />
          <K href="/partner/dispatch" label="طلبات بتتحضّر" v={n("preparing")} />
          <K href="/partner/dispatch" label="جاهزة للكابتن" v={n("ready")} />
          <K href="/partner/account" label={n("owed") >= 0 ? "علينا للشركاء" : "لينا عند الشركاء"} v={`${money(Math.abs(n("owed")))} ج`} />
        </>}
        {id === "setup" && <>
          <K href="/locations" label="المواقع" v={n("locations")} />
          <K href="/locations" label="مواقع من غير إحداثيات" v={n("no_geo")} warn />
          <K href="/users" label="الموظفين" v={n("users")} />
          <K href="/zones" label="مناطق التوصيل" v={n("districts")} />
        </>}
      </div>

      <div className="tiles">
        {g.links.map((l) => <Tile key={l.href} href={l.href} icon={l.icon} color={l.color} label={l.label} />)}
      </div>

      {(chart[id] || id === "branches" || id === "accounts" || id === "orders") && (
        <div className="grid2" style={{ marginTop: 16 }}>
          {chart[id] && !!series.length && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{chart[id][0]}</h2>
              <Bars data={series} unit={chart[id][1]} />
            </div>
          )}
          {id === "branches" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>مبيعات كل فرع النهارده</h2>
              <table><tbody>{((s.by_branch ?? []) as { name: string; v: number; n: number }[]).map((b) => <tr key={b.name}><td><b>{b.name}</b></td><td className="num">{money(b.v)} ج</td><td className="muted">{b.n} فاتورة</td></tr>)}</tbody></table>
              {!((s.by_branch ?? []) as unknown[]).length && <div className="muted">لسه مفيش مبيعات النهارده</div>}
            </div>
          )}
          {id === "accounts" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>مصروفات الشهر حسب النوع</h2>
              <table><tbody>{((s.by_cat ?? []) as { name: string; v: number }[]).map((b) => <tr key={b.name}><td>{b.name}</td><td className="num">{money(b.v)} ج</td></tr>)}</tbody></table>
            </div>
          )}
          {id === "orders" && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>طلبات الشهر حسب القناة</h2>
              <table><tbody>{Object.entries((s.by_channel ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{CH[k] ?? k}</td><td className="num">{v}</td></tr>)}</tbody></table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
