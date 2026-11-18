import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import Tools from "./Tools";

type Ln = { at: string; kind: string; ref: string; detail: string | null; who: string | null; loc: string | null; link: string | null; lah: number; alayh: number; info: boolean; bal: number };
type R = { opening: number; closing: number; lines: Ln[] };
const T: Record<string, string> = { supplier: "مورد", employee: "موظف", partner: "شريك", customer: "عميل" };

/** كارت الحساب: أي طرف — كل حركة بتاريخها، إيه اللي حصل، مين ومنين، المستند، وله/عليه والرصيد */
export default async function Ledger({ searchParams }: { searchParams: Promise<{ t?: string; id?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  const ok = (t: string) => t === "supplier" ? can(me, "acc.view") || can(me, "purchase.edit") || can(me, "acc.pay")
    : t === "employee" ? can(me, "hr.pay") || can(me, "acc.view") : t === "partner" ? can(me, "partner.settle") || can(me, "acc.view") : can(me, "cs.agent") || can(me, "orders.handle") || can(me, "acc.view") || can(me, "credit.view") || can(me, "credit.collect");
  const types = Object.keys(T).filter(ok);
  if (!types.length) redirect("/dashboard");
  const t = sp.t && types.includes(sp.t) ? sp.t : types[0];
  const sb = await supabaseServer();
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const from = sp.from ?? `${today.slice(0, 4)}-01-01`, to = sp.to ?? today;
  const { data: parties } = t === "supplier" ? await sb.from("suppliers").select("id,name").order("name")
    : t === "employee" ? await sb.from("profiles").select("id,name").eq("is_owner", false).eq("is_test", false).order("name")
    : t === "partner" ? await sb.from("partners").select("id,name").order("name")
    : sp.id ? await sb.from("customers").select("id,name,phone").eq("id", Number(sp.id)) : { data: [] as { id: number; name: string }[] };
  const P = (parties ?? []) as { id: string | number; name: string | null; phone?: string }[];
  const id = sp.id ?? (t !== "customer" ? String(P[0]?.id ?? "") : "");
  const { data, error } = id ? await sb.rpc("party_ledger", { p_type: t, p_id: id, p_from: from, p_to: to }) : { data: null, error: null };
  const r = data as R | null;
  const name = P.find((p) => String(p.id) === id)?.name ?? "";
  const bal = (n: number) => (Math.abs(n) < 0.005 ? "0" : t === "employee" ? (n < 0 ? `عليه ${money(-n)} ج` : `ليه ${money(n)} ج`) : n > 0 ? `علينا ${money(n)} ج` : `لينا ${money(-n)} ج`);
  return (
    <>
      <div className="top"><h1>كارت الحساب{name ? ` — ${name}` : ""}</h1>{r && <Tools print={`/print/ledger?${new URLSearchParams({ t, id, from, to })}`} name={`${T[t]}-${name}`} rows={r.lines.map((l) => ({ "التاريخ": new Date(l.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }), "البيان": l.kind, "المستند": l.ref, "التفاصيل": l.detail ?? "", "مين": l.who ?? "", "فين": l.loc ?? "", "له": l.info ? "" : l.lah, "عليه": l.info ? "" : l.alayh, "الرصيد": l.bal }))} />}</div>
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">النوع<select name="t" defaultValue={t}>{types.map((k) => <option key={k} value={k}>{T[k]}</option>)}</select></label>
        {t !== "customer" ? <label className="fld" style={{ flex: 1 }}>الطرف<select name="id" defaultValue={id}>{P.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.name}</option>)}</select></label>
          : <label className="fld" style={{ flex: 1 }}>رقم العميل (من صفحة العملاء)<input name="id" defaultValue={id} dir="ltr" /></label>}
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn pri">اعرض</button>
      </form>
      {error && <div className="badmsg">{error.message}</div>}
      {r && (() => {
        const L = r.lines;
        const sumLah = L.filter((l) => !l.info).reduce((a, l) => a + Number(l.lah), 0);
        const sumAl = L.filter((l) => !l.info).reduce((a, l) => a + Number(l.alayh), 0);
        const lahLbl = t === "employee" ? "اتخصم / رجّعه" : "له (حقه)";
        const alLbl = t === "employee" ? "عليه (خده)" : t === "customer" ? "عليه (اشترى)" : "عليه (اتدفعله)";
        return (
          <>
            <div className="lg-sum">
              <div><span>أول المدة</span><b>{bal(Number(r.opening))}</b></div>
              <div><span>{lahLbl}</span><b className="lg-in">{money(sumLah)} ج</b></div>
              <div><span>{alLbl}</span><b className="lg-out">{money(sumAl)} ج</b></div>
              <div className="lg-end"><span>الرصيد آخر المدة</span><b>{bal(Number(r.closing))}</b></div>
            </div>
            <div className="card" style={{ padding: 0 }}>
              {L.map((l, i) => {
                const amt = l.info ? Number(l.lah) || Number(l.alayh) : Number(l.lah) || Number(l.alayh);
                const isIn = !l.info && Number(l.lah) > 0;
                return (
                  <div key={i} className={`lg-row${l.info ? " lg-info" : ""}`}>
                    <div className="lg-main">
                      <div className="lg-top"><b>{l.kind}</b> <span className="muted">· {l.link ? <Link href={l.link}>{l.ref}</Link> : l.ref}</span></div>
                      {l.detail && <div className="lg-detail">{l.detail}</div>}
                      <div className="muted lg-meta">{new Date(l.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}{l.who ? ` · ${l.who}` : ""}{l.loc ? ` · ${l.loc}` : ""}</div>
                    </div>
                    <div className="lg-amt">
                      {amt ? <b className={l.info ? "muted" : isIn ? "lg-in" : "lg-out"}>{l.info ? "" : isIn ? "+" : "−"}{money(amt)} ج</b> : null}
                      <span className="lg-tag">{l.info ? "للعلم" : isIn ? lahLbl : alLbl}</span>
                      {!l.info && <span className="lg-bal">الرصيد: {bal(Number(l.bal))}</span>}
                    </div>
                  </div>
                );
              })}
              {!L.length && <div className="muted" style={{ padding: 16 }}>مفيش حركات في الفترة دي</div>}
            </div>
            <div className="note">{t === "employee" ? "\"عليه\" = سلف وعهد ومشتريات آجل، \"له\" = اللي اتخصم أو اترد. المرتبات والجزاءات والعهد العينية ظاهرة للعلم ومش داخلة في الرصيد."
              : t === "customer" ? "طلبات العميل للعلم (بتتدفع عند الاستلام)." : "\"له\" = حق الطرف عندنا (استلامات/أصناف)، \"عليه\" = اللي اتدفعله أو اتباعله."}</div>
            <style>{`
              .lg-sum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
              .lg-sum>div{background:var(--card,#fff);border:1px solid var(--line,#e5e5e5);border-radius:14px;padding:10px 12px;display:grid;gap:2px}
              .lg-sum span{font-size:12.5px;opacity:.7}.lg-sum b{font-size:17px}
              .lg-end{border-color:#f5c800!important;border-width:2px!important}
              .lg-in{color:#16a34a}.lg-out{color:#dc2626}
              .lg-row{display:flex;gap:12px;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--line,#eee)}
              .lg-row:last-child{border-bottom:0}.lg-info{opacity:.7}
              .lg-main{flex:1;min-width:0}.lg-top{font-size:15px}.lg-detail{font-size:13.5px;margin-top:2px;overflow-wrap:anywhere}
              .lg-meta{font-size:12px;margin-top:3px}
              .lg-amt{display:grid;justify-items:end;align-content:start;gap:1px;white-space:nowrap;text-align:end}
              .lg-amt b{font-size:16px}.lg-tag{font-size:11.5px;opacity:.65}.lg-bal{font-size:12px;opacity:.8}
              @media (max-width:640px){.lg-sum{grid-template-columns:1fr 1fr}.lg-sum b{font-size:15px}}
            `}</style>
          </>
        );
      })()}
    </>
  );
}
