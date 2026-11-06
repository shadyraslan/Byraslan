import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Tabs, { Flash } from "../Tabs";
import Selfie from "../Selfie";
import { custodyConfirm, custodyDecide, custodyGive } from "../pay-actions";

type M = { id: number; no: number; user_id: string; kind: string; amount: number; received: number | null; status: string; category_id: number | null; location_id: string | null; note: string | null; photo: string | null; at: string; decision_note: string | null; payroll_month: string | null };
const K: Record<string, string> = { give: "استلم عهدة", spend: "صرف", return: "سلّم الباقي", shortage: "عجز" };
const ST: Record<string, string> = { ok: "", pending: "مستني", rejected: "مرفوض" };
const f = (n: number) => Math.round(Number(n)).toLocaleString("en");
const d = (s: string) => new Date(s).toLocaleString("ar-EG", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo" });

export default async function Custody({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "col.adv") && !can(me, "col.approve") && !can(me, "acc.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: moves }, { data: people }, { data: cats }, { data: locs }] = await Promise.all([
    sb.from("custody_moves").select("*").order("id", { ascending: false }).limit(1000),
    sb.from("profiles").select("id,name,is_test").eq("active", true).order("name"),
    sb.from("expense_categories").select("id,name"),
    sb.from("locations").select("id,name"),
  ]);
  const M = (moves ?? []) as M[];
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const CN = new Map((cats ?? []).map((c) => [c.id as number, c.name as string]));
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const bal = new Map<string, { give: number; spend: number; ret: number; short: number }>();
  for (const m of M) {
    if (!(m.status === "ok" || (m.kind === "spend" && m.status === "pending"))) continue;
    const b = bal.get(m.user_id) ?? { give: 0, spend: 0, ret: 0, short: 0 };
    if (m.kind === "give") b.give += +m.amount; else if (m.kind === "spend") b.spend += +m.amount; else if (m.kind === "return") b.ret += +(m.received ?? m.amount); else b.short += +m.amount;
    bal.set(m.user_id, b);
  }
  const spends = M.filter((m) => m.kind === "spend" && m.status === "pending");
  const rets = M.filter((m) => m.kind === "return" && m.status === "pending");
  return (
    <>
      <div className="top"><h1>العهد</h1></div>
      <Tabs cur="/hr/custody" />
      <Flash sp={sp} />
      {can(me, "col.adv") && (
        <form action={custodyGive} className="card row" style={{ alignItems: "end" }}>
          <h2 style={{ width: "100%", margin: 0 }}>+ عهدة لأي حد في الشركة</h2>
          <label className="fld">الموظف<select name="user" required>{(people ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="fld">المبلغ<input name="amount" inputMode="decimal" dir="ltr" required style={{ width: 110 }} /></label>
          <label className="fld" style={{ flex: 1 }}>ملاحظة<input name="note" placeholder="بنزين، مشتريات…" /></label>
          <button className="btn pri">سجّل العهدة</button>
        </form>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>مصروفات مستنية موافقة ({spends.length})</h2>
        <table><tbody>{spends.map((m) => (
          <tr key={m.id}>
            <td><b>{PN.get(m.user_id)}</b><div className="muted">#{m.no} · {d(m.at)}</div></td>
            <td className="num"><b>{f(m.amount)} ج</b></td><td>{CN.get(m.category_id ?? 0)} · {LN.get(m.location_id ?? "")}</td>
            <td style={{ whiteSpace: "normal" }}>{m.note}</td><td>{m.photo && <Selfie path={m.photo} label="🧾 الفاتورة" />}</td>
            <td>{can(me, "col.approve") && <form action={custodyDecide} className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input type="hidden" name="id" value={m.id} /><input name="note" placeholder="رد" style={{ width: 100, height: 32 }} />
              <button name="ok" value="1" className="btn pri" style={{ height: 32 }}>وافق</button><button name="ok" value="0" className="btn" style={{ height: 32 }}>ارفض</button></form>}</td>
          </tr>
        ))}</tbody></table>
        {!spends.length && <div className="muted">مفيش</div>}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>تسليم باقي العهدة مستني تأكيد ({rets.length})</h2>
        <table><tbody>{rets.map((m) => (
          <tr key={m.id}>
            <td><b>{PN.get(m.user_id)}</b><div className="muted">#{m.no} · {d(m.at)}</div></td><td>بيقول سلّم <b className="num">{f(m.amount)} ج</b></td><td>{m.note}</td>
            <td>{m.user_id !== me?.id && <form action={custodyConfirm} className="row" style={{ gap: 4, flexWrap: "nowrap" }}><input type="hidden" name="id" value={m.id} />
              <input name="received" defaultValue={m.amount} inputMode="decimal" dir="ltr" style={{ width: 90, height: 32 }} /><input name="note" placeholder="ملاحظة" style={{ width: 100, height: 32 }} />
              <button className="btn pri" style={{ height: 32 }}>استلمت المبلغ ده</button></form>}</td>
          </tr>
        ))}</tbody></table>
        {!rets.length && <div className="muted">مفيش</div>}
        <div className="muted">لو المبلغ اللي استلمته أقل، الفرق بيتسجّل عجز ويتخصم من مرتبه (لو الإعداد شغّال في اللايحة).</div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>معاهم دلوقتي</h2>
        <table><thead><tr><th>الموظف</th><th>استلم</th><th>صرف</th><th>سلّم</th><th>عجز</th><th>معاه</th></tr></thead>
          <tbody>{[...bal.entries()].map(([u, b]) => ({ u, b, now: b.give - b.spend - b.ret - b.short })).sort((a, b) => b.now - a.now).map(({ u, b, now }) => (
            <tr key={u}><td><b>{PN.get(u)}</b></td><td className="num">{f(b.give)}</td><td className="num">{f(b.spend)}</td><td className="num">{f(b.ret)}</td><td className="num">{f(b.short)}</td><td className="num"><b style={{ color: now < 0 ? "var(--bad)" : undefined }}>{f(now)}</b></td></tr>
          ))}</tbody></table>
        <div className="muted">بالسالب = صرف من جيبه أكتر من العهدة (الشركة عليها له).</div>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>آخر الحركات</h2>
        <table><tbody>{M.slice(0, 80).map((m) => (
          <tr key={m.id}><td className="num">#{m.no}</td><td>{d(m.at)}</td><td><b>{PN.get(m.user_id)}</b></td><td>{K[m.kind]} {ST[m.status] && <span className="muted">({ST[m.status]})</span>}</td>
            <td className="num">{f(m.received ?? m.amount)}</td><td style={{ whiteSpace: "normal" }}>{[m.category_id ? CN.get(m.category_id) : null, m.note, m.decision_note && `الرد: ${m.decision_note}`, m.payroll_month && `اتخصم في مرتب ${m.payroll_month.slice(0, 7)}`].filter(Boolean).join(" · ")}</td></tr>
        ))}</tbody></table>
      </div>
    </>
  );
}
