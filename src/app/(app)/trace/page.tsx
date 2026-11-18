import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

async function recall(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const q = String(fd.get("q"));
  const { data, error } = await sb.rpc("lot_recall", { p_code: q, p_reason: String(fd.get("reason") || "") });
  revalidatePath("/trace");
  redirect(`/trace?q=${encodeURIComponent(q)}&${error ? `err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : `ok=${encodeURIComponent(`اتسحب — ${(data as { boxes: number }).boxes} علبة اتوقفت عن البيع والفروع اتبلّغت`)}`}`);
}

type Tr = {
  lot: { code: string; item: string; unit: string; supplier: string | null; supplier_id: number | null; qty: number; received_at: string; expires: string | null; receipt: string | null; receipt_id: number | null; loc: string | null; status: string; recall_reason: string | null; recalled_at: string | null };
  orders: { id: number; no: number; item: string; qty: number; status: string; at: string; used: number | null }[];
  boxes: { sn: number; item: string; weight: number; status: string; loc: string | null; packed_at: string }[];
  sales: { kind: string; ref: string; at: string; branch: string | null; box: number; customer: string; status?: string }[];
};
type BL = { lot: string; item: string; supplier: string | null; received_at: string; status: string; order: number };
const BS: Record<string, string> = { stock: "في المخزون", transit: "في التحويل", loaded: "في العربية", sold: "اتباعت", waste: "هالك", donated: "تبرعات", missing: "مفقودة", recalled: "متسحبة" };
const d = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** التتبّع: لوط ← أوامر الإنتاج ← العلب ← الفروع ← الفواتير والعملاء. أو علبة ← لوطاتها والمورد. وسحب لوط */
export default async function Trace({ searchParams }: { searchParams: Promise<{ q?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["stock.view", "prod.orders", "stock.recall"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const q = (sp.q ?? "").trim();
  let tr: Tr | null = null; let bl: BL[] = []; let boxSn: number | null = null;
  if (q) {
    if (/^\d+$/.test(q)) { boxSn = Number(q); bl = ((await sb.rpc("box_lots", { p_sn: boxSn })).data ?? []) as BL[]; }
    if (!bl.length) tr = (await sb.rpc("lot_trace", { p_code: q })).data as Tr | null;
  }
  const custs = tr ? [...new Set(tr.sales.map((s) => s.customer.trim()).filter(Boolean))] : [];
  return (
    <>
      <div className="top"><h1>التتبّع</h1><span className="pill">من المورد للعميل — والعكس</span></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld" style={{ flex: 1 }}>امسح رقم اللوط (من ملصق الاستلام) أو رقم العلبة<input name="q" defaultValue={q} autoFocus dir="ltr" style={{ height: 46, fontSize: 17 }} /></label>
        <button className="btn pri" style={{ height: 46 }}>تتبّع</button>
      </form>

      {boxSn != null && bl.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>العلبة #{boxSn} اتعملت من:</h2>
          {bl.map((l) => (
            <div key={l.lot} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", padding: "6px 0" }}>
              <span><b dir="ltr">{l.lot}</b> · {l.item} · مورد: <b>{l.supplier ?? "—"}</b> · استلام {d(l.received_at)} · أمر إنتاج #{l.order}{l.status === "recalled" ? " · ⛔ متسحب" : ""}</span>
              <Link className="btn" href={`/trace?q=${encodeURIComponent(l.lot)}`}>تتبّع اللوط ده</Link>
            </div>
          ))}
          <Link href={`/boxes?sn=${boxSn}`} className="muted">حركة العلبة نفسها ←</Link>
        </div>
      )}
      {boxSn != null && !bl.length && !tr && <div className="card muted">العلبة دي مالهاش لوطات متسجّلة (أمرها اتعمل قبل التتبّع أو أول غرفة ماسجّلتش اللوط).</div>}
      {q && boxSn == null && !tr && <div className="card muted">مفيش لوط بالرقم ده.</div>}

      {tr && (
        <>
          <div className="card" style={{ display: "grid", gap: 6, borderColor: tr.lot.status === "recalled" ? "var(--bad)" : undefined }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>لوط <span dir="ltr">{tr.lot.code}</span> — {tr.lot.item}</h2>
              {tr.lot.status === "recalled" && <b style={{ color: "var(--bad)" }}>⛔ متسحب {tr.lot.recalled_at ? d(tr.lot.recalled_at) : ""}: {tr.lot.recall_reason}</b>}
            </div>
            <div>المورد: <b>{tr.lot.supplier ?? "—"}</b>{tr.lot.supplier_id && <> · <Link href={`/accounts/ledger?t=supplier&id=${tr.lot.supplier_id}`}>كارته</Link></>} · الكمية {tr.lot.qty} {tr.lot.unit} · استلام {d(tr.lot.received_at)}{tr.lot.loc ? ` في ${tr.lot.loc}` : ""}{tr.lot.receipt_id && <> · <Link href={`/purchasing/receipts/${tr.lot.receipt_id}`}>{tr.lot.receipt}</Link></>}{tr.lot.expires ? ` · صلاحية ${tr.lot.expires}` : ""}</div>
            <div className="row" style={{ gap: 14 }}>
              <span>أوامر إنتاج: <b>{tr.orders.length}</b></span>
              <span>علب: <b>{tr.boxes.length}</b></span>
              <span>في المخزون دلوقتي: <b>{tr.boxes.filter((b) => ["stock", "transit", "loaded"].includes(b.status)).length}</b></span>
              <span>اتباعت: <b>{tr.sales.length}</b></span>
              <span>عملاء معروفين: <b>{custs.length}</b></span>
            </div>
            {tr.lot.status !== "recalled" && can(me, "stock.recall") && (
              <details>
                <summary style={{ color: "var(--bad)", fontWeight: 800 }}>⛔ سحب اللوط ده</summary>
                <form action={recall} className="row" style={{ marginTop: 8 }}>
                  <input type="hidden" name="q" value={tr.lot.code} />
                  <input name="reason" required placeholder="سبب السحب (مثلاً: نتيجة تحليل، شكوى عميل)" style={{ flex: 1 }} />
                  <button className="btn pri" style={{ background: "var(--bad)" }}>اسحب — وقف بيع كل علبه</button>
                </form>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>كل علبة من اللوط ده في أي فرع أو تحويل هتتوقف عن البيع وتتشال من المخزون، وكل الفروع هتاخد رسالة.</div>
              </details>
            )}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>أوامر الإنتاج اللي دخل فيها</h3>
            {tr.orders.map((o) => <div key={o.id}>#{o.no} · {o.item} · {o.qty}{o.used ? ` · استخدم ${o.used}` : ""} · {d(o.at)}</div>)}
            {!tr.orders.length && <div className="muted">لسه مادخلش إنتاج.</div>}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>العلب ({tr.boxes.length})</h3>
            <table><thead><tr><th>العلبة</th><th>الصنف</th><th>الوزن</th><th>فين</th><th>حالتها</th></tr></thead>
              <tbody>{tr.boxes.map((b) => <tr key={b.sn} style={{ color: b.status === "recalled" ? "var(--bad)" : undefined }}><td className="num"><Link href={`/boxes?sn=${b.sn}`}>#{b.sn}</Link></td><td>{b.item}</td><td className="num">{b.weight}</td><td>{b.loc}</td><td>{BS[b.status] ?? b.status}</td></tr>)}</tbody></table>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <h3 style={{ marginTop: 0 }}>اتباعت لمين ({tr.sales.length})</h3>
            <table><thead><tr><th>الفاتورة / الطلب</th><th>إمتى</th><th>الفرع</th><th>العلبة</th><th>العميل</th></tr></thead>
              <tbody>{tr.sales.map((s, i) => <tr key={i}><td>{s.kind} <b>{s.ref}</b></td><td>{d(s.at)}</td><td>{s.branch}</td><td className="num">#{s.box}</td><td dir="auto">{s.customer || <span className="muted">عميل كاشير (مش معروف)</span>}</td></tr>)}</tbody></table>
            <div className="muted" style={{ fontSize: 12.5 }}>عملاء الكاشير بيتعرفوا لو اشتروا آجل أو بالنقاط؛ طلبات الأونلاين والتطبيق كلها معروفة.</div>
          </div>
        </>
      )}
    </>
  );
}
