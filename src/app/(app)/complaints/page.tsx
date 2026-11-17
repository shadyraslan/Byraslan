import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

const back = (e: { message: string } | null, f: string) => redirect(`/complaints?f=${f}${e ? `&err=${encodeURIComponent(e.message.replace(/^.*?ERROR:\s*/, ""))}` : "&ok=1"}`);
async function add(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("complaint_add", { p_order_no: fd.get("order") ? Number(fd.get("order")) : null, p_phone: String(fd.get("phone") || ""), p_name: String(fd.get("name") || ""), p_source: String(fd.get("source") || "phone"), p_reason: String(fd.get("reason") || ""), p_details: String(fd.get("details") || ""), p_loc: String(fd.get("loc") || "") });
  revalidatePath("/complaints"); back(error, "new");
}
async function act(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { error } = await sb.rpc("complaint_act", { p_id: Number(fd.get("id")), p_act: String(fd.get("act")), p_note: String(fd.get("note") || "") });
  revalidatePath("/complaints"); back(error, String(fd.get("f") || "new"));
}

type Row = {
  id: number; reason: string; details: string | null; status: string; at: string; source: string; phone: string | null; customer_name: string | null; location_id: string | null;
  resolution: string | null; resolved_at: string | null; closed_at: string | null; close_note: string | null; reopened: number;
  created_by: string | null; resolved_by: string | null; closed_by: string | null;
  online_orders: { id: number; no: number; customers: { name: string; phone: string } | null } | null;
};
type Ev = { complaint_id: number; kind: string; note: string | null; by: string | null; at: string };
const SRC: Record<string, string> = { app: "التطبيق", phone: "تليفون", whatsapp: "واتساب", branch: "في الفرع", staff: "موظف" };
const EV: Record<string, string> = { add: "اتسجلت", resolve: "اتحلت", close: "اتقفلت", reopen: "اتفتحت تاني", note: "ملاحظة" };
const F: [string, string][] = [["new", "مفتوحة"], ["resolved", "اتحلت — مستنية تأكيد العميل"], ["done", "مقفولة"]];
const dt = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** الشكاوى: أي حد من خدمة العملاء أو الفرع يسجّل ← اللي اتعامل معاها يدوس «اتحلت» ويكتب الحل ← خدمة العملاء تقفلها بعد ما العميل يأكد ← إعادة الفتح بصلاحية. كل خطوة متسجّل مين وإمتى */
export default async function Complaints({ searchParams }: { searchParams: Promise<{ f?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["orders.handle", "cs.agent", "complaints.add", "complaints.resolve", "complaints.close"].some((p) => can(me, p))) redirect("/dashboard");
  const f = ["new", "resolved", "done"].includes(sp.f ?? "") ? sp.f! : "new";
  const sb = await supabaseServer();
  const [{ data }, { data: counts }, { data: locs }, { data: people }] = await Promise.all([
    sb.from("app_complaints").select("id,reason,details,status,at,source,phone,customer_name,location_id,resolution,resolved_at,closed_at,close_note,reopened,created_by,resolved_by,closed_by,online_orders(id,no,customers(name,phone))").eq("status", f).order("id", { ascending: false }).limit(200),
    sb.from("app_complaints").select("status"),
    sb.from("locations").select("id,name").in("type", ["dark", "shop"]).order("sort"),
    sb.from("profiles").select("id,name"),
  ]);
  const R = (data ?? []) as unknown as Row[];
  const ids = R.map((r) => r.id);
  const { data: evs } = ids.length ? await sb.from("complaint_events").select("complaint_id,kind,note,by,at").in("complaint_id", ids).order("at") : { data: [] };
  const E = (evs ?? []) as Ev[];
  const PN = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const LN = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const n = (s: string) => (counts ?? []).filter((c) => c.status === s).length;
  const canAdd = ["complaints.add", "cs.agent", "orders.handle"].some((p) => can(me, p));
  const canRes = can(me, "complaints.resolve") || can(me, "orders.handle");
  const canClose = can(me, "complaints.close") || can(me, "cs.agent");
  const canReopen = can(me, "complaints.reopen");
  return (
    <>
      <div className="top"><h1>الشكاوى {n("new") ? `· ${n("new")} مفتوحة` : ""}</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">اتسجّل</div>}
      <div className="row" style={{ marginBottom: 10 }}>{F.map(([k, l]) => <Link key={k} className={f === k ? "btn pri" : "btn"} href={`/complaints?f=${k}`} style={{ display: "inline-grid", placeItems: "center" }}>{l} ({n(k)})</Link>)}</div>
      {canAdd && (
        <details className="card">
          <summary><b>+ سجّل شكوى</b></summary>
          <form action={add} style={{ display: "grid", gap: 8, marginTop: 8 }}>
            <div className="row">
              <label className="fld">رقم الطلب (لو فيه)<input name="order" inputMode="numeric" dir="ltr" style={{ width: 110 }} /></label>
              <label className="fld">موبايل العميل<input name="phone" inputMode="tel" dir="ltr" style={{ width: 140 }} /></label>
              <label className="fld">اسمه<input name="name" /></label>
              <label className="fld">جت منين<select name="source">{Object.entries(SRC).filter(([k]) => k !== "app").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
              <label className="fld">الفرع<select name="loc"><option value="">من الطلب</option>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
            </div>
            <label className="fld">الشكوى عن إيه<input name="reason" required placeholder="مثلاً: الوزن ناقص، التوصيل اتأخر، المنتج مش طازة" /></label>
            <label className="fld">التفاصيل<textarea name="details" rows={2} /></label>
            <button className="btn pri" style={{ justifySelf: "start" }}>سجّل</button>
          </form>
        </details>
      )}
      {R.map((r) => {
        const ev = E.filter((e) => e.complaint_id === r.id);
        const phone = r.phone ?? r.online_orders?.customers?.phone;
        return (
          <div key={r.id} className="card" style={{ borderInlineStart: `4px solid ${r.status === "new" ? "var(--bad)" : r.status === "resolved" ? "var(--y)" : "var(--line)"}`, display: "grid", gap: 6 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{r.reason}</b>
              <span className="muted">{SRC[r.source] ?? r.source} · {dt(r.at)}{r.reopened ? ` · اتفتحت تاني ${r.reopened} مرة` : ""}</span>
            </div>
            {r.details && <div>{r.details}</div>}
            <div className="muted">
              {r.online_orders && <>طلب <Link href={`/orders/${r.online_orders.id}`}><b className="num">#{r.online_orders.no}</b></Link> · </>}
              {r.customer_name ?? r.online_orders?.customers?.name}{phone && <> · <a className="num" href={`tel:${phone}`}>{phone}</a></>}
              {r.location_id && <> · فرع {LN.get(r.location_id) ?? r.location_id}</>}
            </div>
            {r.resolution && <div style={{ background: "rgba(22,163,74,.12)", borderRadius: 8, padding: "4px 8px" }}>✓ الحل: {r.resolution} <span className="muted">— {PN.get(r.resolved_by ?? "") ?? ""}</span></div>}
            <div className="muted" style={{ fontSize: 12.5 }}>{ev.map((e) => `${EV[e.kind] ?? e.kind}: ${PN.get(e.by ?? "") ?? "العميل"} ${dt(e.at)}${e.note && e.kind !== "add" && e.kind !== "resolve" ? ` (${e.note})` : ""}`).join(" ← ")}</div>
            <div className="row">
              {r.status === "new" && canRes && <form action={act} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="act" value="resolve" /><input type="hidden" name="f" value={f} /><input name="note" placeholder="اتحلت إزاي؟ (إجباري)" required style={{ width: 260 }} /><button className="btn pri" style={{ height: 34 }}>اتحلت</button></form>}
              {r.status === "resolved" && canClose && <form action={act} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="act" value="close" /><input type="hidden" name="f" value={f} /><input name="note" placeholder="العميل قال إيه؟" style={{ width: 200 }} /><button className="btn pri" style={{ height: 34 }}>كلّمت العميل وراضي — اقفل</button></form>}
              {r.status !== "new" && canReopen && <form action={act} className="row" style={{ gap: 4 }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="act" value="reopen" /><input type="hidden" name="f" value={f} /><input name="note" placeholder="سبب إعادة الفتح" required style={{ width: 180 }} /><button className="btn" style={{ height: 34 }}>افتحها تاني</button></form>}
              <form action={act} className="row" style={{ gap: 4, marginInlineStart: "auto" }}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="act" value="note" /><input type="hidden" name="f" value={f} /><input name="note" placeholder="ملاحظة" style={{ width: 160 }} /><button className="btn" style={{ height: 34 }}>ضيف</button></form>
            </div>
          </div>
        );
      })}
      {!R.length && <div className="card muted">مفيش شكاوى هنا</div>}
    </>
  );
}
