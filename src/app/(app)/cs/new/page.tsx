import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Shop, { type Init } from "@/app/order/Shop";

type Cust = { found: boolean; name: string | null; addresses: { address: string; district_id: number | null; district: string | null }[];
  orders: { no: number; status: string; at: string; total: number; district_id: number | null; address: string | null; lines: { item_id: number; name: string; qty: number }[] | null }[] };

/** طلب واتساب / تليفون: رقم العميل ← كارته وعناوينه وطلباته ← نفس شاشة الطلب، أو لينك سلة جاهزة */
export default async function CsNew({ searchParams }: { searchParams: Promise<{ phone?: string; ch?: string; re?: string; a?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "cs.agent") && !can(me, "orders.handle")) redirect("/dashboard");
  const sb = await supabaseServer();
  const phone = (sp.phone ?? "").replace(/\D/g, "");
  const ch = sp.ch === "phone" ? "phone" : "whatsapp";
  const [{ data: cfgD }, custR, { data: bk }] = await Promise.all([
    sb.rpc("app_config"),
    phone.length >= 10 ? sb.rpc("cs_customer", { p_phone: phone }) : Promise.resolve({ data: null }),
    sb.from("settings").select("value").eq("key", "booking").maybeSingle(),
  ]);
  const bcfg = (bk?.value ?? {}) as { on?: boolean; days_ahead?: number };
  const cfg = (cfgD ?? {}) as { note?: string; open?: boolean; min_order?: number; districts?: { id: number; name: string; city: string; branch: string | null; branch_name: string | null; fee: number }[] };
  const D = (cfg.districts ?? []).map((d) => ({ ...d, id: Number(d.id), fee: Number(d.fee) }));
  const c = custR.data as Cust | null;
  const addr = c?.addresses[Number(sp.a ?? 0)] ?? null;
  const last = sp.re ? c?.orders.find((o) => String(o.no) === sp.re) : undefined;
  const init: Init | undefined = phone.length >= 10 ? {
    district: last?.district_id ?? addr?.district_id ?? null,
    cart: last ? Object.fromEntries((last.lines ?? []).map((l) => [l.item_id, Number(l.qty)])) : undefined,
    info: { name: c?.name ?? "", phone, address: last?.address ?? addr?.address ?? "" },
  } : undefined;
  const q = (x: Record<string, string>) => `/cs/new?${new URLSearchParams({ phone, ch, ...x })}`;
  return (
    <>
      <div className="top"><h1>طلب واتساب / تليفون</h1><Link className="btn" href="/cs" style={{ display: "inline-grid", placeItems: "center" }}>→ خدمة العملاء</Link></div>
      <form className="card row" style={{ alignItems: "end" }}>
        <label className="fld">رقم العميل<input name="phone" defaultValue={phone} inputMode="tel" dir="ltr" autoFocus required /></label>
        <label className="fld">جه منين<select name="ch" defaultValue={ch}><option value="whatsapp">واتساب</option><option value="phone">تليفون</option></select></label>
        <button className="btn pri">دوّر</button>
      </form>
      {c && (
        <div className="card">
          <b>{c.found ? c.name || "عميل" : "عميل جديد — هيتسجّل مع الطلب"}</b>
          {!!c.addresses.length && <div className="row" style={{ gap: 6, marginTop: 6 }}>{c.addresses.map((a, i) => <Link key={i} className={String(i) === (sp.a ?? "0") && !last ? "btn pri" : "btn"} href={q({ a: String(i) })}>📍 {a.district ?? ""} — {a.address.slice(0, 30)}</Link>)}</div>}
          {!!c.orders.length && (
            <div style={{ marginTop: 8 }}>
              <div className="muted">آخر طلباته — دوس "نفس الطلب" يتحط في السلة:</div>
              {c.orders.slice(0, 4).map((o) => (
                <div key={o.no} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid #eee", padding: "4px 0" }}>
                  <span><b>#{o.no}</b> · {Math.round(o.total)} ج · <span className="muted">{(o.lines ?? []).map((l) => `${l.name} ${l.qty}`).join("، ")}</span></span>
                  <Link className="btn" style={{ height: 30 }} href={q({ re: String(o.no) })}>نفس الطلب</Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {phone.length >= 10 && (
        <div className="shop" style={{ minHeight: 0 }} key={`${phone}-${sp.re ?? ""}-${sp.a ?? ""}`}>
          <Shop districts={D} open={cfg.open !== false} minOrder={Number(cfg.min_order ?? 0)} channel={ch} note={cfg.note ?? ""} init={init} staff={{ channel: ch }} booking={{ on: bcfg.on !== false, days: Number(bcfg.days_ahead ?? 14) }} />
        </div>
      )}
    </>
  );
}
