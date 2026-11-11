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
      <div className="top"><h1>كارت الحساب{name ? ` — ${name}` : ""}</h1>{r && <Tools name={`${T[t]}-${name}`} rows={r.lines.map((l) => ({ "التاريخ": new Date(l.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" }), "البيان": l.kind, "المستند": l.ref, "التفاصيل": l.detail ?? "", "مين": l.who ?? "", "فين": l.loc ?? "", "له": l.info ? "" : l.lah, "عليه": l.info ? "" : l.alayh, "الرصيد": l.bal }))} />}</div>
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">النوع<select name="t" defaultValue={t}>{types.map((k) => <option key={k} value={k}>{T[k]}</option>)}</select></label>
        {t !== "customer" ? <label className="fld" style={{ flex: 1 }}>الطرف<select name="id" defaultValue={id}>{P.map((p) => <option key={String(p.id)} value={String(p.id)}>{p.name}</option>)}</select></label>
          : <label className="fld" style={{ flex: 1 }}>رقم العميل (من صفحة العملاء)<input name="id" defaultValue={id} dir="ltr" /></label>}
        <label className="fld">من<input type="date" name="from" defaultValue={from} /></label>
        <label className="fld">لحد<input type="date" name="to" defaultValue={to} /></label>
        <button className="btn pri">اعرض</button>
      </form>
      {error && <div className="badmsg">{error.message}</div>}
      {r && (
        <div className="card" style={{ overflowX: "auto" }}>
          <div className="row" style={{ justifyContent: "space-between" }}><span>أول المدة: <b>{bal(Number(r.opening))}</b></span><span>آخر المدة: <b>{bal(Number(r.closing))}</b></span></div>
          <table>
            <thead><tr><th>التاريخ</th><th>البيان</th><th>التفاصيل</th><th>مين / فين</th><th>له</th><th>عليه</th><th>الرصيد</th></tr></thead>
            <tbody>
              {r.lines.map((l, i) => (
                <tr key={i} style={{ opacity: l.info ? 0.75 : 1 }}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(l.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", year: "2-digit", hour: "numeric", minute: "2-digit" })}</td>
                  <td><b>{l.kind}</b><div className="muted" style={{ fontSize: 12 }}>{l.link ? <Link href={l.link}>{l.ref}</Link> : l.ref}</div></td>
                  <td style={{ fontSize: 13, maxWidth: 360 }}>{l.detail}</td>
                  <td style={{ fontSize: 13 }}>{l.who}{l.loc ? <div className="muted">{l.loc}</div> : null}</td>
                  <td className="num">{!l.info && Number(l.lah) ? money(Number(l.lah)) : ""}</td>
                  <td className="num">{!l.info && Number(l.alayh) ? money(Number(l.alayh)) : l.info && Number(l.alayh) ? <span className="muted">{money(Number(l.alayh))}</span> : ""}</td>
                  <td className="num">{l.info ? <span className="muted">للعلم</span> : bal(Number(l.bal))}</td>
                </tr>
              ))}
              {!r.lines.length && <tr><td colSpan={7} className="muted">مفيش حركات في الفترة دي</td></tr>}
            </tbody>
          </table>
          <div className="note">{t === "employee" ? "\"عليه\" = سلف وعهد ومشتريات آجل، \"له\" = اللي اتخصم أو اترد. المرتبات والجزاءات والعهد العينية ظاهرة للعلم ومش داخلة في الرصيد."
            : t === "customer" ? "طلبات العميل للعلم (بتتدفع عند الاستلام)." : "\"له\" = حق الطرف عندنا (استلامات/أصناف)، \"عليه\" = اللي اتدفعله أو اتباعله."}</div>
        </div>
      )}
    </>
  );
}
