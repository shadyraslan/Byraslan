import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can, need } from "@/lib/perms";

type C = { id: number; name: string | null; phone: string; tier: string; company: string | null; balance: number; earned: number; redeemed: number; expiring_30: number; last: string | null };
type H = { kind: string; points: number; at: string; note: string | null; expires_at: string | null; who: string | null; order_no: number | null; token: string | null };
type Cfg = { on?: boolean; earn_per?: number; point_value?: number; min_redeem?: number; expire_months?: number; vip_mult?: number; wholesale?: boolean; max_pct?: number; channels?: string[]; code_minutes?: number };
export const dynamic = "force-dynamic";
const TIER: Record<string, string> = { normal: "عادي", vip: "VIP", wholesale: "جملة" };
const KIND: Record<string, string> = { earn: "كسب من طلب", redeem: "استبدال", refund: "رجوع نقاط طلب اتلغى", reverse: "طلب رجع", expire: "انتهت مدتها", adjust: "تعديل يدوي" };
const CH: [string, string][] = [["app", "التطبيق"], ["store", "الفروع (الكاشير بكود التطبيق)"], ["web", "الموقع"], ["phone", "تليفون"], ["whatsapp", "واتساب"]];
const msg = (e: { message?: string } | null) => (e?.message ?? "").replace(/^.*?ERROR:\s*/, "");
const S = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
function back(q: string, error: { message?: string } | null, ok: string): never {
  revalidatePath("/loyalty");
  redirect(`/loyalty?${q}${q ? "&" : ""}${error ? `err=${encodeURIComponent(msg(error))}` : `ok=${encodeURIComponent(ok)}`}`);
}

async function saveCfg(fd: FormData) {
  "use server";
  await need("loyalty.edit");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("loyalty_save", { p: {
    on: fd.get("on") === "on", earn_per: Number(S(fd, "earn_per")), point_value: Number(S(fd, "point_value")), min_redeem: Number(S(fd, "min_redeem")),
    expire_months: Number(S(fd, "expire_months")), vip_mult: Number(S(fd, "vip_mult")), wholesale: fd.get("wholesale") === "on", max_pct: Number(S(fd, "max_pct")), code_minutes: Number(S(fd, "code_minutes")),
    channels: fd.getAll("ch").map(String) } });
  back("", error, "اتحفظت إعدادات النقاط");
}
async function adjustPts(fd: FormData) {
  "use server";
  await need("loyalty.adjust");
  const sb = await supabaseServer();
  const sign = S(fd, "sign") === "minus" ? -1 : 1;
  const { error } = await sb.rpc("points_adjust", { p_cust: Number(S(fd, "cust")), p_points: sign * Math.round(Number(S(fd, "pts"))), p_note: S(fd, "note") });
  back(`c=${S(fd, "cust")}`, error, "اتسجّل التعديل");
}
async function setTier(fd: FormData) {
  "use server";
  await need("loyalty.edit");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("customer_tier_set", { p_cust: Number(S(fd, "cust")), p_tier: S(fd, "tier") });
  back(`c=${S(fd, "cust")}`, error, "اتغيّرت الشريحة");
}

/** نقاط الولاء: الإعدادات (كل رقم في إيد صاحب الصلاحية)، رصيد كل عميل وتاريخه، والتعديل اليدوي بحد */
export default async function Loyalty({ searchParams }: { searchParams: Promise<{ q?: string; c?: string; err?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["loyalty.edit", "loyalty.adjust", "cs.agent"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: list }, { data: cfgRow }, hist] = await Promise.all([
    sb.rpc("points_list", { p_q: sp.q ?? "" }),
    sb.from("settings").select("value").eq("key", "loyalty").maybeSingle(),
    sp.c ? sb.rpc("points_history", { p_cust: Number(sp.c) }) : Promise.resolve({ data: null }),
  ]);
  const cfg = (cfgRow?.value ?? {}) as Cfg;
  const L = (list ?? []) as C[];
  const cur = sp.c ? L.find((x) => x.id === Number(sp.c)) ?? null : null;
  const H = (hist.data ?? []) as H[];
  const pv = Number(cfg.point_value ?? 0);
  const totBal = L.reduce((s, x) => s + Number(x.balance), 0);
  return (
    <>
      <div className="top"><h1>نقاط العملاء</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="card muted" style={{ marginBottom: 10 }}>
        {cfg.on === false ? "النقاط مقفولة دلوقتي." : <>كل <b>{cfg.earn_per}</b> ج = نقطة · النقطة بـ <b>{pv}</b> ج · أقل استبدال <b>{cfg.min_redeem}</b> نقطة · أقصى استبدال <b>{cfg.max_pct}%</b> من الطلب · بتنتهي بعد <b>{cfg.expire_months}</b> شهور · VIP × {cfg.vip_mult} · الجملة {cfg.wholesale ? "بتاخد نقاط" : "مابتاخدش نقاط"} · القنوات: {(cfg.channels ?? []).map((c) => CH.find((x) => x[0] === c)?.[1] ?? c).join("، ")}</>}
        <div style={{ marginTop: 4 }}>الرصيد الظاهر لكل العملاء في القايمة: <b>{totBal.toLocaleString("ar-EG")}</b> نقطة ≈ {(totBal * pv).toLocaleString("ar-EG")} ج</div>
      </div>
      <form className="row" style={{ marginBottom: 8 }}><input name="q" defaultValue={sp.q ?? ""} placeholder="دوّر بالاسم أو الموبايل" style={{ flex: 1 }} /><button className="btn">دوّر</button></form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>العميل</th><th>الشريحة</th><th>الرصيد</th><th>قيمته</th><th>كسب</th><th>استبدل</th><th>هينتهي خلال 30 يوم</th><th></th></tr></thead>
          <tbody>{L.map((x) => (
            <tr key={x.id}>
              <td><b>{x.company ?? x.name}</b><div className="muted" dir="ltr" style={{ fontSize: 12, textAlign: "end" }}>{x.phone}</div></td>
              <td>{TIER[x.tier] ?? x.tier}</td>
              <td className="num"><b>{Number(x.balance).toLocaleString("ar-EG")}</b></td>
              <td className="num">{(x.balance * pv).toLocaleString("ar-EG")} ج</td>
              <td className="num">{x.earned}</td><td className="num">{x.redeemed}</td>
              <td className="num" style={{ color: x.expiring_30 > 0 ? "#ea580c" : undefined }}>{x.expiring_30 || "—"}</td>
              <td><Link className="btn" href={`/loyalty?c=${x.id}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}>فتح</Link></td>
            </tr>))}
            {!L.length && <tr><td colSpan={8} className="muted">{sp.q ? "مفيش عميل بالبحث ده" : "لسه محدش كسب نقاط"}</td></tr>}
          </tbody>
        </table>
      </div>

      {cur && (
        <div className="card" style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}>{cur.company ?? cur.name} — {cur.balance} نقطة</h2><Link className="btn" href={`/loyalty${sp.q ? `?q=${encodeURIComponent(sp.q)}` : ""}`}>قفل</Link></div>
          <div className="row" style={{ gap: 8 }}>
            {can(me, "loyalty.edit") && (
              <form action={setTier} className="row" style={{ alignItems: "end" }}>
                <input type="hidden" name="cust" value={cur.id} />
                <label className="fld">الشريحة<select name="tier" defaultValue={cur.tier}>{Object.entries(TIER).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
                <button className="btn">غيّر</button>
              </form>)}
            {can(me, "loyalty.adjust") && (
              <form action={adjustPts} className="row" style={{ alignItems: "end", flex: 1 }}>
                <input type="hidden" name="cust" value={cur.id} />
                <label className="fld">تعديل<select name="sign"><option value="plus">إضافة</option><option value="minus">خصم</option></select></label>
                <label className="fld">نقاط<input name="pts" type="number" min={1} required style={{ width: 90 }} /></label>
                <label className="fld" style={{ flex: 1 }}>السبب<input name="note" required placeholder="تعويض، هدية، تصحيح…" /></label>
                <button className="btn pri">سجّل</button>
              </form>)}
          </div>
          <table>
            <thead><tr><th>التاريخ</th><th>الحركة</th><th>النقاط</th><th>تفاصيل</th><th>مين</th></tr></thead>
            <tbody>{H.map((h, i) => (
              <tr key={i}>
                <td>{new Date(h.at).toLocaleDateString("ar-EG")}</td><td>{KIND[h.kind] ?? h.kind}</td>
                <td className="num" style={{ color: h.points > 0 ? "#15803d" : "#b91c1c" }}>{h.points > 0 ? "+" : ""}{h.points}</td>
                <td>{h.token ? <Link href={`/t/${h.token}`}>{h.note}</Link> : h.note}{h.expires_at && h.points > 0 ? <span className="muted"> · تنتهي {new Date(h.expires_at).toLocaleDateString("ar-EG")}</span> : null}</td>
                <td className="muted">{h.who ?? "السيستم"}</td>
              </tr>))}</tbody>
          </table>
        </div>)}

      {can(me, "loyalty.edit") && (
        <form action={saveCfg} className="card" style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <b>إعدادات النقاط</b>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="on" defaultChecked={cfg.on !== false} /> النقاط شغالة</label>
          <div className="row">
            <label className="fld">كل كام جنيه = نقطة<input name="earn_per" inputMode="decimal" dir="ltr" defaultValue={cfg.earn_per ?? 10} style={{ width: 90 }} /></label>
            <label className="fld">قيمة النقطة (ج)<input name="point_value" inputMode="decimal" dir="ltr" defaultValue={cfg.point_value ?? 0.1} style={{ width: 90 }} /></label>
            <label className="fld">أقل استبدال (نقطة)<input name="min_redeem" type="number" min={0} defaultValue={cfg.min_redeem ?? 200} style={{ width: 90 }} /></label>
            <label className="fld">أقصى استبدال % من الطلب<input name="max_pct" type="number" min={0} max={100} defaultValue={cfg.max_pct ?? 50} style={{ width: 90 }} /></label>
            <label className="fld">بتنتهي بعد (شهور)<input name="expire_months" type="number" min={1} defaultValue={cfg.expire_months ?? 6} style={{ width: 90 }} /></label>
            <label className="fld">كود الفرع شغال (دقايق)<input name="code_minutes" type="number" min={1} max={60} defaultValue={cfg.code_minutes ?? 5} style={{ width: 90 }} /></label>
            <label className="fld">مضاعف VIP<input name="vip_mult" inputMode="decimal" dir="ltr" defaultValue={cfg.vip_mult ?? 1.5} style={{ width: 90 }} /></label>
          </div>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="wholesale" defaultChecked={!!cfg.wholesale} /> عملاء الجملة ياخدوا نقاط (الطلبات الآجل مابتاخدش نقاط)</label>
          <div className="row" style={{ gap: 12 }}><b>بتتكسب من:</b>{CH.map(([k, t]) => <label key={k} className="row" style={{ gap: 4 }}><input type="checkbox" name="ch" value={k} defaultChecked={(cfg.channels ?? ["app"]).includes(k)} /> {t}</label>)}</div>
          <button className="btn pri" style={{ justifySelf: "start" }}>حفظ</button>
        </form>)}
    </>
  );
}
