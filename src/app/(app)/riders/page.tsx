import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveRider, settleRider, saveTudzi, saveTudziCfg } from "./actions";

type Rd = { id: number; name: string; phone: string | null; kind: string; location_id: string | null; active: boolean };
type C = { rider_id: number; amount: number; at: string; settled_at: string | null; location_id: string | null; online_orders: { no: number } | null };
const KIND: Record<string, string> = { own: "طيارنا", tudzi: "تودزي", other: "خارجي" };
const money = (n: number) => Math.round(n * 100) / 100;

/** الطيارين: القايمة، والكاش اللي مع كل واحد لحد ما يسلّمه */
export default async function Riders({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["riders.manage", "riders.settle", "orders.handle", "acc.view", "tudzi.manage"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: rs }, { data: locs }, { data: cash }] = await Promise.all([
    sb.from("riders").select("id,name,phone,kind,location_id,active").order("active", { ascending: false }).order("name"),
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).eq("active", true).order("sort"),
    sb.from("rider_cash").select("rider_id,amount,at,settled_at,location_id,online_orders(no)").or(`settled_at.is.null,settled_at.gte.${new Date(Date.now() - 7 * 864e5).toISOString()}`).order("at", { ascending: false }).limit(2000),
  ]);
  const R = (rs ?? []) as Rd[];
  const { data: tl } = await sb.rpc("tudzi_link_list");
  const TL = (tl ?? []) as { loc: string; name: string; ready: boolean; auto: boolean; active: boolean }[];
  const { data: tcfg } = await sb.from("settings").select("value").eq("key", "tudzi").maybeSingle();
  const fb = Number((tcfg?.value as { fallback_min?: number } | null)?.fallback_min ?? 10);
  const Cs = (cash ?? []) as unknown as C[];
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const edit = can(me, "riders.manage");
  return (
    <>
      <div className="top"><h1>الطيارين</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="muted" style={{ marginBottom: 10 }}>الطلب الكاش لما يتسلّم، فلوسه بتتسجّل على الطيار لحد ما يسلّمها — في وردية الكاشير (بتدخل الدرج) أو هنا بصلاحية. التقفيل اليومي مش بيستنى الطيار.</div>
      {(can(me, "riders.manage") || can(me, "orders.handle")) && (
        <form action={saveRider} className="card row" style={{ alignItems: "end" }}>
          <label className="fld">اسم الطيار<input name="name" required /></label>
          <label className="fld">الموبايل<input name="phone" dir="ltr" inputMode="tel" style={{ width: 140 }} /></label>
          <label className="fld">النوع<select name="kind">{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="fld">الفرع<select name="loc"><option value="">كل الفروع</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <button className="btn pri">+ ضيف طيار</button>
        </form>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الطيار</th><th>النوع</th><th>الفرع</th><th>معاه كاش</th><th>طلبات مستنية</th><th>سلّم آخر 7 أيام</th><th></th></tr></thead>
          <tbody>{R.map((r) => {
            const open = Cs.filter((c) => c.rider_id === r.id && !c.settled_at);
            const done = Cs.filter((c) => c.rider_id === r.id && c.settled_at);
            const owe = open.reduce((a, c) => a + Number(c.amount), 0);
            const oldest = open.length ? Math.round((Date.now() - new Date(open[open.length - 1].at).getTime()) / 36e5) : 0;
            return (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.5 }}>
                <td><b>{r.name}</b>{r.phone && <div className="muted num">{r.phone}</div>}</td>
                <td>{KIND[r.kind] ?? r.kind}</td>
                <td>{r.location_id ? LN.get(r.location_id) ?? r.location_id : "كل الفروع"}</td>
                <td className="num" style={{ fontWeight: 800, color: oldest > 24 ? "var(--bad)" : undefined }}>{money(owe)} ج{oldest > 24 ? ` · من ${Math.round(oldest / 24)} يوم` : ""}</td>
                <td className="muted">{open.map((c) => `#${c.online_orders?.no ?? ""}`).join("، ")}</td>
                <td className="num">{money(done.reduce((a, c) => a + Number(c.amount), 0))} ج</td>
                <td className="row" style={{ gap: 4 }}>
                  {owe > 0 && can(me, "riders.settle") && <form action={settleRider}><input type="hidden" name="rider" value={r.id} /><button className="btn pri" style={{ height: 30 }}>استلمت {money(owe)}</button></form>}
                  {edit && <form action={saveRider}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="name" value={r.name} /><input type="hidden" name="phone" value={r.phone ?? ""} /><input type="hidden" name="kind" value={r.kind} /><input type="hidden" name="loc" value={r.location_id ?? ""} /><input type="hidden" name="active" value={r.active ? "0" : "1"} /><button className="btn" style={{ height: 30 }}>{r.active ? "وقّفه" : "رجّعه"}</button></form>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
        {!R.length && <div className="muted">لسه مفيش طيارين — ضيفهم من فوق أو من شاشة الطلب وقت الخروج.</div>}
      </div>
      {can(me, "tudzi.manage") && (
        <div className="card" style={{ display: "grid", gap: 10 }}>
          <h2 style={{ margin: 0 }}>🛵 التوصيل بتودزي</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            لكل فرع: في تطبيق تودزي للمحل ← «حسابي» ← «اربط متجرك» ← WooCommerce ← اختار الفرع، وانسخ <b>رابط الـ Webhook</b> و<b>المفتاح (Secret)</b> وحطهم هنا.
            بيتحفظوا في خزنة سرية ومش بيظهروا تاني. «أوتوماتيك» = الطلب يروح لتودزي أول ما الفرع يبدأ يجهّزه؛ من غيره الفرع بيدوس «ابعت لتودزي» بنفسه.
          </div>
          {TL.map((t) => (
            <form key={t.loc} action={saveTudzi} className="row" style={{ alignItems: "end", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <input type="hidden" name="loc" value={t.loc} />
              <b style={{ minWidth: 110, alignSelf: "center" }}>{t.name} {t.ready ? "✅" : "—"}</b>
              <label className="fld" style={{ flex: 2, minWidth: 220 }}>رابط الـ Webhook<input name="url" dir="ltr" placeholder={t.ready ? "محفوظ — اكتب جديد لو هتغيّره" : "https://…/functions/v1/store-hook/…"} /></label>
              <label className="fld" style={{ flex: 1, minWidth: 160 }}>المفتاح<input name="key" type="password" dir="ltr" autoComplete="off" placeholder={t.ready ? "محفوظ" : ""} /></label>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" name="auto" defaultChecked={t.auto} /> أوتوماتيك</label>
              <label className="row" style={{ gap: 4 }}><input type="checkbox" name="active" defaultChecked={t.ready ? t.active : true} /> شغال</label>
              <button className="btn pri">احفظ</button>
            </form>
          ))}
          <form action={saveTudziCfg} className="row" style={{ alignItems: "end" }}>
            <label className="fld">لو مفيش كابتن قبل خلال (دقيقة) نبّه الفرع<input name="fb" defaultValue={fb} inputMode="numeric" dir="ltr" style={{ width: 90 }} /></label>
            <button className="btn">احفظ</button>
          </form>
        </div>
      )}
    </>
  );
}
