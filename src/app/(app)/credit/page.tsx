import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { openCredit, collect, adjust, saveCreditCfg } from "./actions";

type A = { customer_id: number; name: string | null; company: string | null; phone: string; tier: string; tax_no: string | null; note: string | null; limit: number; days: number; active: boolean;
  balance: number; overdue: number; oldest_due: string | null; available: number; blocked: string | null; last_pay: string | null };
export const dynamic = "force-dynamic";
const TIER: Record<string, string> = { normal: "عادي", vip: "VIP", wholesale: "جملة" };
const METHOD: [string, string][] = [["cash", "كاش"], ["transfer", "تحويل بنكي"], ["instapay", "إنستاباي"], ["cheque", "شيك"]];
const d = (s: string | null) => (s ? new Date(s).toLocaleDateString("ar-EG", { day: "numeric", month: "numeric", year: "2-digit" }) : "—");

/** حسابات الآجل: حد لكل عميل ومدة سداد، البيع آجل من الكاشير، التحصيل، المتأخرات، وكارت الحساب */
export default async function Credit({ searchParams }: { searchParams: Promise<{ err?: string; ok?: string; c?: string; f?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["credit.view", "credit.open", "credit.collect"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: locs }, { data: cfgRow }] = await Promise.all([
    sb.rpc("credit_list"),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    sb.from("settings").select("value").eq("key", "credit").maybeSingle(),
  ]);
  const cfg = (cfgRow?.value ?? {}) as { block_overdue?: boolean; grace_days?: number; default_days?: number };
  const all = (data ?? []) as A[];
  const L = sp.f === "late" ? all.filter((a) => a.overdue > 0) : sp.f === "off" ? all.filter((a) => !a.active || a.blocked) : all;
  const cur = sp.c ? all.find((a) => a.customer_id === Number(sp.c)) : null;
  const tot = { bal: all.reduce((s, a) => s + Number(a.balance), 0), od: all.reduce((s, a) => s + Number(a.overdue), 0), lim: all.reduce((s, a) => s + Number(a.limit), 0) };
  const wa = (a: A) => `https://wa.me/2${a.phone.replace(/\D/g, "").replace(/^2/, "")}?text=${encodeURIComponent(`أهلاً ${a.company ?? a.name ?? ""}، ده تذكير من باي رسلان: رصيد حسابكم ${money(a.balance)} ج${a.overdue > 0 ? `، منه ${money(a.overdue)} ج متأخر من ${a.oldest_due}` : ""}. شكراً لتعاملكم معانا.`)}`;
  return (
    <>
      <div className="top"><h1>حسابات الآجل</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="grid2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", marginBottom: 10 }}>
        <div className="card"><div className="muted">عدد الحسابات</div><b style={{ fontSize: 22 }}>{all.length}</b></div>
        <div className="card"><div className="muted">إجمالي اللي لينا</div><b style={{ fontSize: 22 }}>{money(tot.bal)}</b></div>
        <div className="card" style={tot.od > 0 ? { borderColor: "#e11d48" } : undefined}><div className="muted">متأخر</div><b style={{ fontSize: 22, color: tot.od > 0 ? "#e11d48" : undefined }}>{money(tot.od)}</b></div>
        <div className="card"><div className="muted">مجموع الحدود</div><b style={{ fontSize: 22 }}>{money(tot.lim)}</b></div>
      </div>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        {([["", "الكل"], ["late", `عليهم متأخرات (${all.filter((a) => a.overdue > 0).length})`], ["off", "موقوفين أو ممنوعين"]] as const).map(([k, t]) => (
          <Link key={k} className={(sp.f ?? "") === k ? "btn pri" : "btn"} href={`/credit${k ? `?f=${k}` : ""}`} style={{ display: "inline-grid", placeItems: "center" }}>{t}</Link>))}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>العميل</th><th>الحد</th><th>المدة</th><th>الرصيد</th><th>المتاح</th><th>متأخر</th><th>آخر تحصيل</th><th>الحالة</th><th></th></tr></thead>
          <tbody>{L.map((a) => (
            <tr key={a.customer_id}>
              <td><b>{a.company ?? a.name}</b>{a.company && <div className="muted" style={{ fontSize: 12 }}>{a.name}</div>}<div className="muted" dir="ltr" style={{ fontSize: 12, textAlign: "end" }}>{a.phone}</div></td>
              <td className="num">{money(a.limit)}</td><td>{a.days} يوم</td>
              <td className="num"><b>{money(a.balance)}</b></td><td className="num">{money(a.available)}</td>
              <td className="num" style={{ color: a.overdue > 0 ? "#e11d48" : undefined }}>{a.overdue > 0 ? <>{money(a.overdue)}<div style={{ fontSize: 11 }}>من {a.oldest_due}</div></> : "—"}</td>
              <td>{d(a.last_pay)}</td>
              <td>{!a.active ? <span className="pill">موقوف</span> : a.blocked ? <span className="pill" style={{ background: "#FDECEC", color: "#b91c1c" }}>ممنوع البيع</span> : <span className="pill" style={{ background: "#F0FAF3", color: "#15803d" }}>شغال</span>}</td>
              <td className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <Link className="btn" href={`/credit?c=${a.customer_id}`}>فتح</Link>
                <Link className="btn" href={`/accounts/ledger?t=customer&id=${a.customer_id}`}>كشف حساب</Link>
                {a.balance > 0 && <a className="btn" href={wa(a)} target="_blank" rel="noreferrer">تذكير واتساب</a>}
              </td>
            </tr>))}
            {!L.length && <tr><td colSpan={9} className="muted">مفيش حسابات</td></tr>}
          </tbody>
        </table>
      </div>

      {cur && (
        <div className="card" style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{cur.company ?? cur.name}</h2><Link className="btn" href="/credit">قفل</Link></div>
          <div className="muted">الرصيد {money(cur.balance)} ج · المتاح {money(cur.available)} ج{cur.blocked ? ` · ${cur.blocked}` : ""}</div>
          {can(me, "credit.collect") && (
            <form action={collect} className="row" style={{ alignItems: "end" }}>
              <input type="hidden" name="cust" value={cur.customer_id} />
              <b style={{ alignSelf: "center" }}>تحصيل</b>
              <label className="fld">المبلغ<input name="amount" inputMode="decimal" dir="ltr" required style={{ width: 110 }} /></label>
              <label className="fld">الطريقة<select name="method">{METHOD.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <label className="fld">رقم التحويل/الشيك<input name="ref" dir="ltr" style={{ width: 130 }} /></label>
              <label className="fld">الفرع<select name="loc"><option value="">—</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
              <label className="fld" style={{ flex: 1 }}>ملاحظة<input name="note" /></label>
              <button className="btn pri">سجّل التحصيل</button>
            </form>)}
          {can(me, "credit.open") && (
            <form action={adjust} className="row" style={{ alignItems: "end" }}>
              <input type="hidden" name="cust" value={cur.customer_id} />
              <b style={{ alignSelf: "center" }}>تسوية</b>
              <label className="fld">النوع<select name="sign"><option value="minus">خصم من عليه (سماح/خصم)</option><option value="plus">إضافة عليه</option></select></label>
              <label className="fld">المبلغ<input name="amount" inputMode="decimal" dir="ltr" required style={{ width: 110 }} /></label>
              <label className="fld" style={{ flex: 1 }}>السبب<input name="note" required /></label>
              <button className="btn">سجّل</button>
            </form>)}
        </div>)}

      {can(me, "credit.open") && (
        <form action={openCredit} className="card" style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <b>{cur ? `تعديل حساب ${cur.company ?? cur.name}` : "فتح حساب آجل جديد"}</b>
          <div className="row">
            <label className="fld">الموبايل<input name="phone" required dir="ltr" defaultValue={cur?.phone ?? ""} /></label>
            <label className="fld">اسم المسؤول<input name="name" defaultValue={cur?.name ?? ""} /></label>
            <label className="fld" style={{ flex: 1 }}>اسم الشركة / المحل<input name="company" defaultValue={cur?.company ?? ""} /></label>
            <label className="fld">الرقم الضريبي<input name="tax" dir="ltr" defaultValue={cur?.tax_no ?? ""} /></label>
          </div>
          <div className="row">
            <label className="fld">حد الآجل (ج)<input name="limit" inputMode="decimal" dir="ltr" required defaultValue={cur?.limit ?? ""} style={{ width: 120 }} /></label>
            <label className="fld">مدة السداد (يوم)<input name="days" type="number" min={0} max={365} defaultValue={cur?.days ?? cfg.default_days ?? 30} style={{ width: 90 }} /></label>
            <label className="fld">الشريحة<select name="tier" defaultValue={cur?.tier ?? "wholesale"}>{Object.entries(TIER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label className="fld">الحالة<select name="active" defaultValue={cur && !cur.active ? "off" : "on"}><option value="on">شغال</option><option value="off">موقوف</option></select></label>
            <label className="fld" style={{ flex: 1 }}>ملاحظات<input name="note" defaultValue={cur?.note ?? ""} /></label>
          </div>
          <button className="btn pri" style={{ justifySelf: "start" }}>حفظ</button>
        </form>)}

      {can(me, "settings.edit") && (
        <form action={saveCreditCfg} className="card row" style={{ alignItems: "end", marginTop: 10 }}>
          <b style={{ alignSelf: "center" }}>قواعد الآجل</b>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="block" defaultChecked={cfg.block_overdue !== false} /> امنع البيع الآجل لو عليه متأخرات</label>
          <label className="fld">سماح بعد الاستحقاق (يوم)<input name="grace" type="number" min={0} defaultValue={cfg.grace_days ?? 0} style={{ width: 80 }} /></label>
          <label className="fld">مدة السداد الافتراضية (يوم)<input name="ddays" type="number" min={0} defaultValue={cfg.default_days ?? 30} style={{ width: 80 }} /></label>
          <button className="btn">حفظ</button>
        </form>)}
    </>
  );
}
