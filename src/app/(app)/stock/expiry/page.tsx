import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can, need } from "@/lib/perms";
import Choice from "@/components/Choice";

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
  await sb.from("settings").upsert({ key: "expiry", value: { warn_days: Math.max(Number(fd.get("wd") || 1), 0), notify: fd.get("notify") === "on" }, updated_at: new Date().toISOString() });
  revalidatePath("/stock/expiry");
}

type B = { sn: number; weight: number; location_id: string; expires_at: string; items: { name: string; unit: string } | null };

/** الأطباق اللي صلاحيتها خلصت أو قربت — بالفرع، وتتحوّل هالك أو تبرعات بدوسة. وفيه رسالة يومية للفرع */
export default async function Expiry({ searchParams }: { searchParams: Promise<{ loc?: string; ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["stock.view", "stock.waste", "stock.donate"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: cfgRow } = await sb.from("settings").select("value").eq("key", "expiry").maybeSingle();
  const cfg = (cfgRow?.value ?? {}) as { warn_days?: number; notify?: boolean };
  const wd = Number(cfg.warn_days ?? 1);
  const until = new Date(Date.now() + wd * 864e5).toISOString();
  const [{ data }, { data: locs }] = await Promise.all([
    sb.from("boxes").select("sn,weight,location_id,expires_at,items(name,unit)").eq("status", "stock").not("expires_at", "is", null).lt("expires_at", until).order("expires_at").limit(2000),
    sb.from("locations").select("id,name,type").eq("active", true).not("type", "in", "(section,donation)").order("sort"),
  ]);
  const all = ((data ?? []) as unknown as B[]).filter((b) => (locs ?? []).some((l) => l.id === b.location_id));
  const loc = sp.loc ?? "";
  const L = (locs ?? []).filter((l) => all.some((b) => b.location_id === l.id));
  const R = all.filter((b) => !loc || b.location_id === loc);
  const now = Date.now();
  return (
    <>
      <div className="top"><h1>الصلاحية — الأطباق اللي خلصت أو قربت</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="row" style={{ marginBottom: 10 }}>
        <Link className={!loc ? "btn pri" : "btn"} href="/stock/expiry" style={{ display: "inline-grid", placeItems: "center" }}>كل الأماكن ({all.length})</Link>
        {L.map((l) => <Link key={l.id} className={loc === l.id ? "btn pri" : "btn"} href={`/stock/expiry?loc=${l.id}`} style={{ display: "inline-grid", placeItems: "center" }}>{l.name} ({all.filter((b) => b.location_id === l.id).length})</Link>)}
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
          <label className="row" style={{ gap: 6 }}><input type="checkbox" name="notify" defaultChecked={cfg.notify !== false} /> رسالة كل يوم الصبح للفرع (اللي معاه صلاحية الهالك أو التبرعات)</label>
          <button className="btn">احفظ</button>
        </form>
      )}
    </>
  );
}
