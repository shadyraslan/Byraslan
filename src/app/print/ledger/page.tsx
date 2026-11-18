import { supabaseServer } from "@/lib/supabase/server";
import PrintBtn from "../campaign/[id]/PrintBtn";

type Ln = { at: string; kind: string; ref: string; detail: string | null; who: string | null; loc: string | null; lah: number; alayh: number; info: boolean; bal: number };
type R = { opening: number; closing: number; lines: Ln[] };
const T: Record<string, string> = { supplier: "مورد", employee: "موظف", partner: "شريك", customer: "عميل" };
const m = (n: number) => Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** كشف حساب A4 للطباعة — جدول واحد بعرض الورقة، الرأس بيتكرر في كل صفحة */
export default async function LedgerPrint({ searchParams }: { searchParams: Promise<{ t?: string; id?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  const t = sp.t ?? "supplier", id = sp.id ?? "";
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Africa/Cairo" });
  const from = sp.from ?? `${today.slice(0, 4)}-01-01`, to = sp.to ?? today;
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("party_ledger", { p_type: t, p_id: id, p_from: from, p_to: to });
  const nameQ = t === "supplier" ? sb.from("suppliers").select("name").eq("id", Number(id)) : t === "employee" ? sb.from("profiles").select("name").eq("id", id)
    : t === "partner" ? sb.from("partners").select("name").eq("id", Number(id)) : sb.from("customers").select("name,company,phone").eq("id", Number(id));
  const { data: nm } = await nameQ.maybeSingle();
  const party = nm as { name?: string; company?: string; phone?: string } | null;
  const r = data as R | null;
  const bal = (n: number) => (Math.abs(n) < 0.005 ? "0.00" : t === "employee" ? (n < 0 ? `عليه ${m(-n)}` : `ليه ${m(n)}`) : n > 0 ? `علينا ${m(n)}` : `لينا ${m(-n)}`);
  const L = r?.lines ?? [];
  const sumLah = L.filter((l) => !l.info).reduce((a, l) => a + Number(l.lah), 0);
  const sumAl = L.filter((l) => !l.info).reduce((a, l) => a + Number(l.alayh), 0);
  const d = (s: string) => new Date(s).toLocaleDateString("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit", year: "numeric" });
  return (
    <div dir="rtl" className="st">
      <style>{`
        @page { size: A4; margin: 12mm 10mm }
        body { margin: 0; background: #fff; color: #000 }
        .st { font-family: Cairo, Tahoma, sans-serif; font-size: 11px; max-width: 190mm; margin: 0 auto; padding: 10px 0 }
        .hd { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 8px }
        .hd img { height: 42px; background: #000; padding: 4px 8px; border-radius: 6px }
        .hd h1 { margin: 0; font-size: 18px } .hd .sub { font-size: 12px }
        .sum { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 8px 0 }
        .sum div { border: 1px solid #000; border-radius: 6px; padding: 5px 8px } .sum span { display: block; font-size: 10px } .sum b { font-size: 13px }
        table { width: 100%; border-collapse: collapse; table-layout: fixed }
        thead { display: table-header-group } tr { page-break-inside: avoid }
        th { background: #000; color: #fff; padding: 4px 3px; font-size: 10.5px; text-align: right }
        td { border-bottom: 1px solid #bbb; padding: 4px 3px; vertical-align: top; overflow-wrap: anywhere }
        .n { direction: ltr; text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap }
        .info { color: #555 } .foot { margin-top: 10px; display: flex; justify-content: space-between; font-size: 10px }
        .noprint { text-align: center; margin-bottom: 10px }
        @media print { .noprint { display: none } .st { padding: 0 } }
      `}</style>
      <div className="noprint"><PrintBtn /></div>
      <div className="hd">
        <div><h1>كشف حساب {T[t] ?? ""}: {party?.company || party?.name || ""}</h1><div className="sub">من {d(from)} لحد {d(to)}{party?.phone ? ` · ${party.phone}` : ""}</div></div>
        <img src="/logo.png" alt="By Raslan" />
      </div>
      {error && <div>{error.message}</div>}
      <div className="sum">
        <div><span>أول المدة</span><b>{bal(Number(r?.opening ?? 0))}</b></div>
        <div><span>له</span><b>{m(sumLah)}</b></div>
        <div><span>عليه</span><b>{m(sumAl)}</b></div>
        <div style={{ borderWidth: 2 }}><span>آخر المدة</span><b>{bal(Number(r?.closing ?? 0))}</b></div>
      </div>
      <table>
        <colgroup><col style={{ width: "13%" }} /><col style={{ width: "17%" }} /><col /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "15%" }} /></colgroup>
        <thead><tr><th>التاريخ</th><th>البيان / المستند</th><th>التفاصيل</th><th>له</th><th>عليه</th><th>الرصيد</th></tr></thead>
        <tbody>
          {L.map((l, i) => (
            <tr key={i} className={l.info ? "info" : ""}>
              <td className="n">{d(l.at)}</td>
              <td><b>{l.kind}</b><div>{l.ref}</div></td>
              <td>{l.detail}{l.who || l.loc ? <div className="info">{[l.who, l.loc].filter(Boolean).join(" · ")}</div> : null}</td>
              <td className="n">{!l.info && Number(l.lah) ? m(l.lah) : ""}</td>
              <td className="n">{!l.info && Number(l.alayh) ? m(l.alayh) : ""}</td>
              <td className="n">{l.info ? "للعلم" : bal(Number(l.bal))}</td>
            </tr>
          ))}
          {!L.length && <tr><td colSpan={6}>مفيش حركات في الفترة دي</td></tr>}
        </tbody>
      </table>
      <div className="foot"><span>اتطبع {new Date().toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</span><span>توقيع: ____________</span></div>
    </div>
  );
}
