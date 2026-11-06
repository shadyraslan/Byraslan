import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Export from "./Export";
import { saveBookingCfg, setDeposit } from "./actions";

type B = { id: number; no: number; token: string; created_at: string; scheduled_for: string; day: string; slot: string; status: string; channel: string; pay_method: string;
  location_id: string; branch: string; district_id: number | null; district: string | null; phone: string; customer: string | null; address: string | null; note: string | null;
  est_total: number; delivery_fee: number; total: number | null; discount: number; deposit: number; deposit_paid: boolean; cancel_reason: string | null; modified_count: number;
  booked_by: string | null; booked_by_name: string | null; lines: { item_id: number; name: string; family_id: number | null; qty: number; price: number }[] | null };
type Sp = Record<string, string | undefined>;

const ST: Record<string, string> = { new: "مأكّد", accepted: "اتقبل", preparing: "بيتجهّز", ready: "جاهز", out: "مع الطيار", delivered: "اتسلّم", cancelled: "اتلغى" };
const CH: Record<string, string> = { app: "تطبيق", web: "ويب", whatsapp: "واتساب", phone: "تليفون" };
const PAY: Record<string, string> = { cash: "كاش", card: "فيزا", instapay: "إنستاباي" };
const GROUPS: [string, string][] = [["", "من غير تجميع"], ["day", "اليوم"], ["slot", "الميعاد"], ["branch", "الفرع"], ["district", "المنطقة"], ["channel", "القناة"], ["status", "الحالة"], ["staff", "الموظف"], ["item", "الصنف"], ["pay", "طريقة الدفع"]];
const cairo = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const f = (n: number) => Math.round(n).toLocaleString("en");
const val = (b: B) => Number(b.total ?? Number(b.est_total) + Number(b.delivery_fee));

/** الحجوزات وتقاريرها: كل الفلاتر + تجميع + إكسل + العربون + سجل التعديلات + المطلوب من كل صنف */
export default async function Bookings({ searchParams }: { searchParams: Promise<Sp> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "orders.handle") && !can(me, "orders.booking") && !can(me, "cs.agent")) redirect("/dashboard");
  const sb = await supabaseServer();
  const from = sp.from ?? cairo(), to = sp.to ?? cairo(new Date(Date.now() + 14 * 86400000));
  const by = sp.by === "created" ? "created" : "day";
  let q = sb.from("v_bookings").select("*").order("scheduled_for").limit(5000);
  if (by === "day") q = q.gte("day", from).lte("day", to);
  else q = q.gte("created_at", `${from}T00:00:00+02:00`).lte("created_at", `${to}T23:59:59+02:00`);
  if (sp.branch) q = q.eq("location_id", sp.branch);
  if (sp.district) q = q.eq("district_id", Number(sp.district));
  if (sp.channel) q = q.eq("channel", sp.channel);
  if (sp.status === "active") q = q.neq("status", "cancelled"); else if (sp.status) q = q.eq("status", sp.status);
  if (sp.staff === "customer") q = q.is("booked_by", null); else if (sp.staff) q = q.eq("booked_by", sp.staff);
  if (sp.pay) q = q.eq("pay_method", sp.pay);
  if (sp.slot) q = q.eq("slot", sp.slot);
  if (sp.phone) q = q.ilike("phone", `%${sp.phone.replace(/\D/g, "")}%`);
  if (sp.dep === "paid") q = q.eq("deposit_paid", true).gt("deposit", 0); else if (sp.dep === "unpaid") q = q.eq("deposit_paid", false).gt("deposit", 0); else if (sp.dep === "none") q = q.eq("deposit", 0);
  if (sp.mod === "yes") q = q.gt("modified_count", 0); else if (sp.mod === "no") q = q.eq("modified_count", 0);
  const [{ data }, { data: locs }, { data: dists }, { data: people }, { data: items }, { data: fams }, { data: cfgRow }] = await Promise.all([
    q,
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
    sb.from("districts").select("id,name").order("name"),
    sb.from("profiles").select("id,name").eq("active", true).order("name"),
    sb.from("items").select("id,name,family_id").eq("active", true).order("name"),
    sb.from("families").select("id,name").order("name"),
    sb.from("settings").select("value").eq("key", "booking").maybeSingle(),
  ]);
  let R = (data ?? []) as B[];
  const item = sp.item ? Number(sp.item) : null, fam = sp.fam ? Number(sp.fam) : null;
  if (item) R = R.filter((b) => (b.lines ?? []).some((l) => l.item_id === item));
  if (fam) R = R.filter((b) => (b.lines ?? []).some((l) => l.family_id === fam));
  if (sp.min) R = R.filter((b) => val(b) >= Number(sp.min));
  if (sp.max) R = R.filter((b) => val(b) <= Number(sp.max));
  if (sp.reason) R = R.filter((b) => (b.cancel_reason ?? "").includes(sp.reason!));
  const active = R.filter((b) => b.status !== "cancelled");
  const cfg = (cfgRow?.value ?? {}) as { on?: boolean; days_ahead?: number; lead_hours?: number; edit_cutoff_hours?: number; release_hours?: number; remind_hours?: number; deposit_pct?: number; max_per_slot?: number; slot_minutes?: number; slots?: string[] };

  // التجميع
  const g = sp.group ?? "";
  const keyOf = (b: B): string[] => g === "day" ? [b.day] : g === "slot" ? [b.slot] : g === "branch" ? [b.branch] : g === "district" ? [b.district ?? "—"] : g === "channel" ? [CH[b.channel] ?? b.channel]
    : g === "status" ? [ST[b.status]] : g === "staff" ? [b.booked_by_name ?? "العميل نفسه"] : g === "pay" ? [PAY[b.pay_method]] : g === "item" ? (b.lines ?? []).map((l) => l.name) : [];
  const groups = new Map<string, { n: number; v: number; qty: number; cancelled: number; dep: number }>();
  if (g) for (const b of R) for (const k of keyOf(b)) {
    const x = groups.get(k) ?? { n: 0, v: 0, qty: 0, cancelled: 0, dep: 0 };
    x.n++; if (b.status === "cancelled") x.cancelled++; else { x.v += g === "item" ? (b.lines ?? []).filter((l) => l.name === k).reduce((a, l) => a + l.qty * l.price, 0) : val(b); x.dep += b.deposit_paid ? Number(b.deposit) : 0; }
    if (g === "item") x.qty += (b.lines ?? []).filter((l) => l.name === k && b.status !== "cancelled").reduce((a, l) => a + Number(l.qty), 0);
    groups.set(k, x);
  }
  // المطلوب تجهيزه: كميات كل صنف لكل يوم وفرع (الحجوزات اللي مش ملغية)
  const demand = new Map<string, number>();
  for (const b of active) for (const l of b.lines ?? []) { const k = `${b.day}|${b.branch}|${l.name}`; demand.set(k, (demand.get(k) ?? 0) + Number(l.qty)); }

  const ids = active.map((b) => b.id);
  const { data: changes } = ids.length ? await sb.from("order_changes").select("order_id,at,kind,by,by_customer,reason").in("order_id", ids.slice(0, 500)).order("at") : { data: [] };
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const CK: Record<string, string> = { create: "اتحجز", lines: "الأصناف اتعدّلت", reschedule: "الميعاد اتغيّر", address: "العنوان اتغيّر", note: "الملاحظة اتغيّرت", cancel: "اتلغى", deposit: "العربون" };
  const exportRows = R.map((b) => ({ "رقم": b.no, "يوم التسليم": b.day, "الميعاد": b.slot, "اتحجز في": new Date(b.created_at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }), "الحالة": ST[b.status],
    "الفرع": b.branch, "المنطقة": b.district ?? "", "القناة": CH[b.channel] ?? b.channel, "العميل": b.customer ?? "", "الموبايل": b.phone, "العنوان": b.address ?? "",
    "الأصناف": (b.lines ?? []).map((l) => `${l.name} × ${l.qty}`).join("، "), "القيمة": Math.round(val(b)), "العربون": b.deposit, "العربون اتدفع": b.deposit_paid ? "أيوه" : "لا",
    "الدفع": PAY[b.pay_method], "الموظف": b.booked_by_name ?? "العميل", "عدد التعديلات": b.modified_count, "سبب الإلغاء": b.cancel_reason ?? "" }));
  const sel = (name: string, opts: [string, string][], label: string) => (
    <label className="fld">{label}<select name={name} defaultValue={sp[name] ?? ""}><option value="">الكل</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
  );
  return (
    <>
      <div className="top"><h1>الحجوزات والتقارير</h1><Link className="btn pri" href="/cs/new" style={{ display: "inline-grid", placeItems: "center" }}>+ حجز واتساب / تليفون</Link></div>
      <form className="card">
        <div className="row" style={{ alignItems: "end" }}>
          <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
          <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
          <label className="fld">التاريخ بـ<select name="by" defaultValue={by}><option value="day">يوم التسليم</option><option value="created">يوم الحجز</option></select></label>
          {sel("branch", (locs ?? []).map((l) => [l.id as string, l.name as string]), "الفرع")}
          {sel("district", (dists ?? []).map((d) => [String(d.id), d.name as string]), "المنطقة")}
          {sel("channel", Object.entries(CH), "القناة")}
          <label className="fld">الحالة<select name="status" defaultValue={sp.status ?? ""}><option value="">الكل</option><option value="active">كل غير الملغي</option>{Object.entries(ST).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="fld">اتحجز بواسطة<select name="staff" defaultValue={sp.staff ?? ""}><option value="">الكل</option><option value="customer">العميل نفسه</option>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          {sel("slot", (cfg.slots ?? []).map((s) => [s, s]), "الميعاد")}
          {sel("pay", Object.entries(PAY), "الدفع")}
          {sel("dep", [["paid", "اتدفع"], ["unpaid", "مستني"], ["none", "مفيش عربون"]], "العربون")}
          {sel("mod", [["yes", "اتعدّل"], ["no", "ماتعدّلش"]], "التعديل")}
          {sel("item", (items ?? []).map((i) => [String(i.id), i.name as string]), "الصنف")}
          {sel("fam", (fams ?? []).map((x) => [String(x.id), x.name as string]), "العائلة")}
          <label className="fld">الموبايل<input name="phone" defaultValue={sp.phone ?? ""} dir="ltr" style={{ width: 120 }} /></label>
          <label className="fld">القيمة من<input name="min" defaultValue={sp.min ?? ""} dir="ltr" style={{ width: 80 }} /></label>
          <label className="fld">لحد<input name="max" defaultValue={sp.max ?? ""} dir="ltr" style={{ width: 80 }} /></label>
          <label className="fld">سبب الإلغاء فيه<input name="reason" defaultValue={sp.reason ?? ""} style={{ width: 120 }} /></label>
          <label className="fld">جمّع بـ<select name="group" defaultValue={g}>{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <button className="btn pri">اعرض</button>
          <Link className="btn" href="/bookings">مسح الفلاتر</Link>
          <Export rows={exportRows} name={`حجوزات ${from} - ${to}`} />
        </div>
      </form>
      <div className="kpis">
        <div className="kpi"><span>الحجوزات</span><b className="num">{active.length}</b></div>
        <div className="kpi"><span>القيمة</span><b className="num">{f(active.reduce((a, b) => a + val(b), 0))}</b></div>
        <div className="kpi"><span>اتلغت</span><b className="num">{R.length - active.length}</b></div>
        <div className="kpi"><span>اتعدّلت</span><b className="num">{active.filter((b) => b.modified_count > 0).length}</b></div>
        <div className="kpi"><span>عربون اتدفع</span><b className="num">{f(active.filter((b) => b.deposit_paid).reduce((a, b) => a + Number(b.deposit), 0))}</b></div>
        <div className="kpi"><span>متوسط الحجز</span><b className="num">{f(active.length ? active.reduce((a, b) => a + val(b), 0) / active.length : 0)}</b></div>
      </div>

      {g && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2>مجمّع بـ {GROUPS.find((x) => x[0] === g)?.[1]}</h2>
          <table><thead><tr><th>{GROUPS.find((x) => x[0] === g)?.[1]}</th><th>عدد</th>{g === "item" && <th>الكمية</th>}<th>القيمة</th><th>اتلغى</th><th>عربون اتدفع</th></tr></thead>
            <tbody>{[...groups.entries()].sort((a, b) => b[1].v - a[1].v).map(([k, x]) => (
              <tr key={k}><td><b>{k}</b></td><td className="num">{x.n}</td>{g === "item" && <td className="num">{Math.round(x.qty * 10) / 10}</td>}<td className="num">{f(x.v)}</td><td className="num">{x.cancelled || "—"}</td><td className="num">{x.dep ? f(x.dep) : "—"}</td></tr>
            ))}</tbody></table>
        </div>
      )}

      {!!demand.size && (
        <details className="card">
          <summary><b>المطلوب تجهيزه للحجوزات (للمخزون والإنتاج)</b></summary>
          <table><thead><tr><th>اليوم</th><th>الفرع</th><th>الصنف</th><th>الكمية</th></tr></thead>
            <tbody>{[...demand.entries()].sort().map(([k, q]) => { const [d, br, n] = k.split("|"); return <tr key={k}><td className="num">{d}</td><td>{br}</td><td>{n}</td><td className="num"><b>{Math.round(q * 10) / 10}</b></td></tr>; })}</tbody></table>
        </details>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        <h2>الحجوزات ({R.length})</h2>
        <table>
          <thead><tr><th>#</th><th>الميعاد</th><th>العميل</th><th>الأصناف</th><th>القيمة</th><th>الفرع · القناة</th><th>الحالة</th><th>العربون</th><th></th></tr></thead>
          <tbody>{R.slice(0, 500).map((b) => {
            const ch = (changes ?? []).filter((c) => c.order_id === b.id);
            return (
              <tr key={b.id} style={b.status === "cancelled" ? { opacity: 0.5 } : undefined}>
                <td className="num"><b>{b.no}</b></td>
                <td className="num">{b.day}<div><b>{b.slot}</b></div></td>
                <td>{b.customer}<div className="muted" dir="ltr">{b.phone}</div>{b.district && <div className="muted">{b.district}</div>}</td>
                <td style={{ whiteSpace: "normal", maxWidth: 260, fontSize: 13 }}>{(b.lines ?? []).map((l) => `${l.name} × ${l.qty}`).join("، ")}{b.note && <div className="muted">📝 {b.note}</div>}</td>
                <td className="num">{f(val(b))}</td>
                <td>{b.branch}<div className="muted">{CH[b.channel]}{b.booked_by_name ? ` · ${b.booked_by_name}` : ""}</div></td>
                <td>{ST[b.status]}{b.cancel_reason && <div className="muted">{b.cancel_reason}</div>}
                  {!!ch.length && <details><summary className="muted" style={{ fontSize: 12 }}>{b.modified_count ? `${b.modified_count} تعديل` : "السجل"}</summary>{ch.map((c, i) => <div key={i} style={{ fontSize: 12 }}>{new Date(c.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} — {CK[c.kind]} {c.by_customer ? "(العميل)" : c.by ? `(${PN.get(c.by) ?? ""})` : ""}{c.reason ? `: ${c.reason}` : ""}</div>)}</details>}
                </td>
                <td>{Number(b.deposit) > 0 ? (
                  can(me, "orders.booking") ? <form action={setDeposit}><input type="hidden" name="token" value={b.token} /><input type="hidden" name="paid" value={b.deposit_paid ? "0" : "1"} /><button className={b.deposit_paid ? "btn" : "btn pri"} style={{ height: 30 }}>{b.deposit_paid ? `✓ ${b.deposit}` : `استلمت ${b.deposit}`}</button></form>
                    : <span>{b.deposit} {b.deposit_paid ? "✓" : ""}</span>) : "—"}</td>
                <td>{["new", "accepted"].includes(b.status) && <a className="btn" style={{ height: 30, display: "inline-grid", placeItems: "center" }} href={`/order?edit=${b.token}`} target="_blank" rel="noreferrer">✏️ تعديل</a>} <a className="btn" style={{ height: 30, display: "inline-grid", placeItems: "center" }} href={`/t/${b.token}`} target="_blank" rel="noreferrer">فتح</a></td>
              </tr>
            );
          })}</tbody>
        </table>
        {R.length > 500 && <div className="muted">بيعرض أول 500 — ضيّق الفلاتر أو نزّل الإكسل.</div>}
      </div>

      {(can(me, "orders.booking") || can(me, "settings.edit")) && (
        <form action={saveBookingCfg} className="card">
          <h2>إعدادات الحجز</h2>
          <div className="row" style={{ alignItems: "end" }}>
            <label className="row" style={{ gap: 6 }}><input type="checkbox" name="on" defaultChecked={cfg.on !== false} style={{ width: 20, height: 20 }} /> الحجز شغال</label>
            <label className="fld">الحجز متاح لحد كام يوم قدام<input name="days" defaultValue={cfg.days_ahead ?? 30} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">أقل وقت قبل الميعاد (ساعة)<input name="lead" defaultValue={cfg.lead_hours ?? 12} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">العميل يعدّل لحد قبل الميعاد بـ (ساعة)<input name="cutoff" defaultValue={cfg.edit_cutoff_hours ?? 24} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">ينزل للفرع قبل الميعاد بـ (ساعة)<input name="release" defaultValue={cfg.release_hours ?? 3} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">تذكير العميل قبلها بـ (ساعة)<input name="remind" defaultValue={cfg.remind_hours ?? 24} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">العربون % (0 = مفيش)<input name="deposit" defaultValue={cfg.deposit_pct ?? 0} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">أقصى حجوزات للميعاد في الفرع (0 = مفتوح)<input name="max" defaultValue={cfg.max_per_slot ?? 0} dir="ltr" style={{ width: 80 }} /></label>
            <label className="fld">المواعيد (افصل بمسافة)<input name="slots" defaultValue={(cfg.slots ?? []).join(" ")} dir="ltr" style={{ width: 260 }} /></label>
          </div>
          <button className="btn pri" style={{ marginTop: 8 }}>احفظ</button>
        </form>
      )}
    </>
  );
}
