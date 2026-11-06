import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { cancelBooking, toggleDeposit } from "../actions";

type O = { id: number; no: number; token: string; status: string; channel: string; created_at: string; branch: string; district: string | null; customer: string | null; phone: string;
  total: number; booking: boolean; scheduled_for: string | null; slot: string | null; deposit: number; deposit_paid: boolean; driver: string | null; cancel_reason: string | null; modified: number;
  lines: string | null; ticket: number | null; complaint: string | null };
const ST: Record<string, string> = { new: "جديد", accepted: "اتقبل", preparing: "بيتجهّز", ready: "جاهز", out: "مع الطيار", delivered: "اتسلّم", cancelled: "اتلغى" };
const CH: Record<string, string> = { app: "📱 تطبيق", web: "🌐 ويب", whatsapp: "🟢 واتساب", phone: "☎️ تليفون" };
const dt = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** متابعة أي طلب أو حجز من أي قناة: بحث برقم الطلب أو الموبايل أو الاسم، وكل الإجراءات من مكان واحد */
export default async function CsOrders({ searchParams }: { searchParams: Promise<{ q?: string; scope?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "cs.agent") && !can(me, "orders.handle")) redirect("/dashboard");
  const scope = sp.scope === "all" || sp.scope === "bookings" ? sp.scope : "open";
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("cs_find_orders", { p_q: sp.q ?? "", p_scope: scope });
  const R = (data ?? []) as O[];
  const tab = (k: string, l: string) => <Link key={k} href={`/cs/orders?scope=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`} className={scope === k ? "btn pri" : "btn"}>{l}</Link>;
  return (
    <>
      <div className="top"><h1>متابعة الطلبات والحجوزات</h1></div>
      <form className="card row" style={{ alignItems: "end" }}>
        <input type="hidden" name="scope" value={scope} />
        <label className="fld" style={{ flex: 1, minWidth: 200 }}>رقم الطلب أو موبايل العميل أو اسمه<input name="q" defaultValue={sp.q ?? ""} autoFocus /></label>
        <button className="btn pri">دوّر</button>
      </form>
      <div className="row" style={{ marginBottom: 10 }}>{tab("open", "المفتوحة")}{tab("bookings", "الحجوزات الجاية")}{tab("all", "الكل")}</div>
      {error && <div className="badmsg">{error.message}</div>}
      {sp.err && <div className="badmsg">{sp.err}</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {R.map((o) => (
          <div key={o.id} className="card" style={{ display: "grid", gap: 6, opacity: o.status === "cancelled" ? 0.6 : 1 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <b style={{ fontSize: 16 }}>#{o.no} · {ST[o.status]}{o.booking ? " · 📅 حجز" : ""}</b>
              <span className="muted">{CH[o.channel] ?? o.channel} · {o.branch}</span>
            </div>
            <div><b>{o.customer}</b> <span className="muted" dir="ltr">{o.phone}</span>{o.district ? <span className="muted"> · {o.district}</span> : null}</div>
            {o.booking && o.scheduled_for && <div style={{ color: "#7A6200", fontWeight: 700 }}>📅 {dt(o.scheduled_for)} — الساعة {o.slot}{o.modified ? ` · اتعدّل ${o.modified} مرة` : ""}</div>}
            <div className="muted" style={{ fontSize: 13 }}>{o.lines}</div>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span><b className="num">{Math.round(Number(o.total))} ج</b> · اتطلب {dt(o.created_at)}{o.driver ? ` · الطيار ${o.driver}` : ""}{o.cancel_reason ? ` · ${o.cancel_reason}` : ""}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <a className="btn" href={`/t/${o.token}`} target="_blank" rel="noreferrer">صفحة المتابعة</a>
              {o.booking && ["new", "accepted"].includes(o.status) && <a className="btn" href={`/order?edit=${o.token}`} target="_blank" rel="noreferrer">✏️ عدّل الحجز</a>}
              <Link className="btn" href={`/cs/new?phone=${o.phone}`}>+ طلب تاني للعميل</Link>
              {o.ticket ? <Link className="btn" href={`/cs?t=${o.ticket}`}>💬 التذكرة</Link> : null}
              {o.complaint && <Link className="btn" href="/complaints">⚠️ شكوى ({o.complaint === "open" ? "مفتوحة" : "اتقفلت"})</Link>}
              {o.booking && Number(o.deposit) > 0 && can(me, "orders.booking") && (
                <form action={toggleDeposit}><input type="hidden" name="token" value={o.token} /><input type="hidden" name="paid" value={o.deposit_paid ? "0" : "1"} /><button className={o.deposit_paid ? "btn" : "btn pri"}>{o.deposit_paid ? `✓ العربون ${o.deposit}` : `استلمت العربون ${o.deposit}`}</button></form>
              )}
              {o.booking && ["new", "accepted"].includes(o.status) && (
                <details><summary className="btn" style={{ display: "inline-grid", placeItems: "center" }}>إلغاء الحجز</summary>
                  <form action={cancelBooking} className="row" style={{ gap: 6, marginTop: 6 }}><input type="hidden" name="token" value={o.token} /><input name="reason" placeholder="السبب" /><button className="btn" style={{ background: "#c62828", color: "#fff" }}>ألغي</button></form>
                </details>
              )}
            </div>
          </div>
        ))}
        {!R.length && <div className="card muted">مفيش طلبات {sp.q ? "بالبحث ده" : ""}</div>}
      </div>
    </>
  );
}
