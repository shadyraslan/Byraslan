import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can, need } from "@/lib/perms";
import Choice from "@/components/Choice";
import Export from "../../users/report/Export";

async function dispose(fd: FormData) {
  "use server";
  await need("stock.waste", "stock.donate");
  const sb = await supabaseServer();
  const loc = String(fd.get("loc")), kind = String(fd.get("kind"));
  if (kind !== "waste" && kind !== "donate") return;
  const sns = fd.getAll("sn").map(Number).filter(Boolean);
  const { data, error } = await sb.rpc("dispose_boxes", { p_loc: loc, p_kind: kind, p_boxes: sns, p_reason: kind === "waste" ? "صلاحية خلصت" : "قربت تخلص — تبرعات" });
  revalidatePath("/stock/expiry");
  redirect(`/stock/expiry?loc=${loc}&${error ? `err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : `ok=${encodeURIComponent(`${data} طبق اتحوّل ${kind === "waste" ? "هالك" : "لمخزن التبرعات"}`)}`}`);
}
async function saveCfg(fd: FormData) {
  "use server";
  await need("settings.edit");
  const sb = await supabaseServer();
  await sb.from("settings").upsert({ key: "expiry", value: { warn_days: Math.max(Number(fd.get("wd") || 1), 0), notify: fd.get("notify") === "on", waste_days: Math.max(Number(fd.get("xd") ?? 1), 0) }, updated_at: new Date().toISOString() });
  revalidatePath("/stock/expiry");
}

type B = { sn: number; item_id: number; weight: number; location_id: string; expires_at: string; items: { name: string; unit: string; sold_by?: string } | null };

/** الأطباق اللي صلاحيتها خلصت أو قربت — بالفرع، وتتحوّل هالك أو تبرعات بدوسة. وفيه رسالة يومية للفرع */
export default async function Expiry({ searchParams }: { searchParams: Promise<{ loc?: string; ok?: string; err?: string; d?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["stock.view", "stock.waste", "stock.donate"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: cfgRow } = await sb.from("settings").select("value").eq("key", "expiry").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as { warn_days?: number; notify?: boolean };
  const wd = sp.d ? Math.max(0, Number(sp.d)) : Number(cfg.warn_days ?? 1);
  const until = new Date(Date.now() + wd * 864e5).toISOString();
  const [{ data }, { data: locs }] = await Promise.all([
    sb.from("boxes").select("sn,item_id,weight,location_id,expires_at,items(name,unit,sold_by)").eq("status", "stock").not("expires_at", "is", null).lt("expires_at", until).order("expires_at").limit(2000),
    sb.from("locations").select("id,name,type").eq("active", true).not("type", "in", "(section,donation)").order("sort"),
  ]);
  const all = ((data ?? []) as unknown as B[]).filter((b) => (locs ?? []).some((l) => l.id === b.location_id));
  const loc = sp.loc ?? "";
  const L = (locs ?? []).filter((l) => all.some((b) => b.location_id === l.id));
  const R = all.filter((b) => !loc || b.location_id === loc);
  const now = Date.now();
  // قيمة بسعر البيع في الفرع + اللي اتعدم بسبب الصلاحية آخر 30 يوم
  const ids = [...new Set(all.map((b) => b.item_id))];
  const since = new Date(now - 30 * 864e5).toISOString();
  const [{ data: pr }, { data: wst }] = await Promise.all([
    ids.length ? sb.from("prices").select("item_id,location_id,price").eq("channel", "direct").in("item_id", ids) : Promise.resolve({ data: [] as { item_id: number; location_id: string; price: number }[] }),
    sb.from("stock_moves").select("item_id,location_id,qty,reason,at,items(name,unit)").in("kind", ["waste", "donate"]).gte("at", since).or("reason.ilike.%صلاحية%,reason.ilike.%قربت%").limit(5000),
  ]);
  const price = (b: B) => Number((pr ?? []).find((x) => x.item_id === b.item_id && x.location_id === b.location_id)?.price ?? 0);
  const val = (b: B) => (b.items?.sold_by === "piece" ? 1 : Number(b.weight)) * price(b);
  const exp = R.filter((b) => new Date(b.expires_at).getTime() < now), soon = R.filter((b) => new Date(b.expires_at).getTime() >= now);
  const kg = (x: B[]) => Math.round(x.reduce((a, b) => a + Number(b.weight), 0) * 100) / 100;
  const vv = (x: B[]) => Math.round(x.reduce((a, b) => a + val(b), 0));
  const byItem = new Map<string, { item: string; loc: string; unit: string; e: number; s: number; kg: number; v: number }>();
  for (const b of R) {
    const k = `${b.item_id}|${b.location_id}`; const x = byItem.get(k) ?? { item: b.items?.name ?? "", loc: (locs ?? []).find((l) => l.id === b.location_id)?.name ?? "", unit: b.items?.unit ?? "", e: 0, s: 0, kg: 0, v: 0 };
    if (new Date(b.expires_at).getTime() < now) x.e++; else x.s++;
    x.kg += Number(b.weight); x.v += val(b); byItem.set(k, x);
  }
  type W = { item_id: number; location_id: string; qty: number; items: { name: string; unit: string } | null };
  const wasted = new Map<string, { item: string; unit: string; q: number }>();
  for (const w of ((wst ?? []) as unknown as W[]).filter((w) => !loc || w.location_id === loc)) { const x = wasted.get(String(w.item_id)) ?? { item: w.items?.name ?? "", unit: w.items?.unit ?? "", q: 0 }; x.q += Math.abs(Number(w.qty)); wasted.set(String(w.item_id), x); }
  const xl = [...byItem.values()].map((x) => ({ "الصنف": x.item, "المكان": x.loc, "خلصت": x.e, "قربت": x.s, "الوزن": Math.round(x.kg * 100) / 100, "القيمة": Math.round(x.v) }));
  return (
    <>
      <div className="top"><h1>تقرير الصلاحية</h1><Export rows={xl} file="تقرير-الصلاحية-expiry" /></div>
      <form className="card row" style={{ alignItems: "end" }}>
        {loc && <input type="hidden" name="loc" value={loc} />}
        <label className="fld">اعرض اللي خلص أو هيخلص خلال (يوم)<input name="d" defaultValue={wd} inputMode="numeric" dir="ltr" style={{ width: 90 }} /></label>
        <button className="btn">اعرض</button>
        <span className="muted" style={{ fontSize: 12.5 }}>القيمة بسعر البيع في الفرع</span>
      </form>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginBottom: 12 }}>
        <div className="card" style={{ margin: 0, borderColor: exp.length ? "var(--bad)" : undefined }}><div className="muted">صلاحيتها خلصت ولسه في المخزون</div><b style={{ fontSize: 20, color: exp.length ? "var(--bad)" : undefined }}>{exp.length} طبق</b><div className="muted">{kg(exp)} كجم · {vv(exp).toLocaleString("en-US")} ج</div></div>
        <div className="card" style={{ margin: 0, borderColor: soon.length ? "#b7791f" : undefined }}><div className="muted">هتخلص خلال {wd} يوم</div><b style={{ fontSize: 20, color: soon.length ? "#b7791f" : undefined }}>{soon.length} طبق</b><div className="muted">{kg(soon)} كجم · {vv(soon).toLocaleString("en-US")} ج</div></div>
        <div className="card" style={{ margin: 0 }}><div className="muted">اتعدم / اتبرّع بسبب الصلاحية آخر 30 يوم</div><b style={{ fontSize: 20 }}>{[...wasted.values()].reduce((a, w) => a + w.q, 0).toFixed(2)}</b><div className="muted">{wasted.size} صنف</div></div>
      </div>
      {byItem.size > 0 && (
        <div className="card" style={{ overflowX: "auto" }}>
          <h2 style={{ marginTop: 0 }}>بالصنف والمكان</h2>
          <table><thead><tr><th>الصنف</th><th>المكان</th><th>خلصت</th><th>قربت</th><th>الوزن</th><th>القيمة</th></tr></thead>
            <tbody>{[...byItem.values()].sort((a, b) => b.v - a.v).map((x, i) => <tr key={i}><td><b>{x.item}</b></td><td>{x.loc}</td><td className="num" style={{ color: x.e ? "var(--bad)" : undefined }}>{x.e}</td><td className="num" style={{ color: x.s ? "#b7791f" : undefined }}>{x.s}</td><td className="num">{Math.round(x.kg * 100) / 100} {x.unit}</td><td className="num">{Math.round(x.v).toLocaleString("en-US")} ج</td></tr>)}</tbody></table>
        </div>
      )}
      {wasted.size > 0 && (
        <details className="card"><summary><b>اللي اتعدم أو اتبرّع بسبب الصلاحية — آخر 30 يوم</b></summary>
          <table style={{ marginTop: 6 }}><thead><tr><th>الصنف</th><th>الكمية</th></tr></thead><tbody>{[...wasted.values()].sort((a, b) => b.q - a.q).map((w, i) => <tr key={i}><td>{w.item}</td><td className="num">{Math.round(w.q * 100) / 100} {w.unit}</td></tr>)}</tbody></table>
        </details>
      )}
      <h2>الأطباق واحد واحد</h2>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="row" style={{ marginBottom: 10 }}>
        <Link className={!loc ? "btn pri" : "btn"} href={`/stock/expiry${sp.d ? `?d=${wd}` : ""}`} style={{ display: "inline-grid", placeItems: "center" }}>كل الأماكن ({all.length})</Link>
        {L.map((l) => <Link key={l.id} className={loc === l.id ? "btn pri" : "btn"} href={`/stock/expiry?loc=${l.id}${sp.d ? `&d=${wd}` : ""}`} style={{ display: "inline-grid", placeItems: "center" }}>{l.name} ({all.filter((b) => b.location_id === l.id).length})</Link>)}
      </div>
      {!loc && !!L.length && <div className="muted" style={{ marginBottom: 8 }}>اختار المكان عشان تحوّل أطباقه هالك أو تبرعات.</div>}
      <form action={dispose} className="card" style={{ overflowX: "auto" }}>
        <input type="hidden" name="loc" value={loc} />
        <table>
          <thead><tr>{loc && <th></th>}<th>الطبق</th><th>الصنف</th><th>الوزن</th><th>المكان</th><th>الصلاحية</th></tr></thead>
          <tbody>{R.map((b) => { const h = Math.round((new Date(b.expires_at).getTime() - now) / 36e5); return (
            <tr key={b.sn} style={{ color: h < 0 ? "var(--bad)" : "#b7791f" }}>
              {loc && <td><input type="checkbox" name="sn" value={b.sn} defaultChecked={h < 0} /></td>}
              <td className="num"><Link href={`/boxes?sn=${b.sn}`}>#{b.sn}</Link></td>
              <td><b>{b.items?.name}</b></td>
              <td className="num">{b.weight} {b.items?.unit}</td>
              <td>{(locs ?? []).find((l) => l.id === b.location_id)?.name}</td>
              <td>{h < 0 ? `خلصت من ${Math.abs(h) >= 24 ? `${Math.floor(Math.abs(h) / 24)} يوم` : `${Math.abs(h)} ساعة`}` : `فاضل ${h >= 24 ? `${Math.floor(h / 24)} يوم` : `${h} ساعة`}`}</td>
            </tr>); })}
            {!R.length && <tr><td colSpan={6} className="muted">مفيش أطباق صلاحيتها خلصت أو قربت 👍</td></tr>}
          </tbody>
        </table>
        {loc && !!R.length && (
          <div className="row" style={{ marginTop: 10 }}>
            <Choice name="kind" opts={[...(can(me, "stock.waste") ? [{ v: "waste", label: "حوّل المختار هالك", pri: true }] : []), ...(can(me, "stock.donate") ? [{ v: "donate", label: "حوّل المختار لمخزن التبرعات" }] : [])]} />
            <span className="muted" style={{ fontSize: 12.5 }}>اللي خلصت صلاحيته متعلّم لوحده؛ اللي قرب علّم عليه بنفسك.</span>
          </div>
        )}
      </form>
      {can(me, "settings.edit") && (
        <form action={saveCfg} className="card row" style={{ alignItems: "end" }}>
          <label className="fld">«قربت» يعني فاضل أقل من (يوم)<input name="wd" defaultValue={wd} inputMode="numeric" dir="ltr" style={{ width: 80 }} /></label>
          <label className="fld">الفرع يهلك/يتبرّع باللي فاضله (يوم أو أقل)<input name="xd" defaultValue={(cfg as { waste_days?: number }).waste_days ?? 1} inputMode="numeric" dir="ltr" style={{ width: 80 }} /></label>
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="notify" defaultChecked={cfg.notify !== false} /> رسالة كل يوم الصبح للفرع (اللي معاه صلاحية الهالك أو التبرعات)</label>
          <button className="btn">احفظ</button>
        </form>
      )}
    </>
  );
}
