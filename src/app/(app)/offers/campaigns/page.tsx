import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveCampaign, saveColors } from "./actions";
import CampaignForm, { DEFAULT_COLORS, type LabelColor } from "./CampaignForm";

type C = { id: number; name: string; subtitle: string | null; color: string; starts_at: string; ends_at: string; status: string; locations: string[] | null };
export const dynamic = "force-dynamic";
const ST: Record<string, string> = { draft: "مسودة", pending: "مستني اعتماد", approved: "متعمد — مستني ميعاده", live: "شغال دلوقتي", ended: "خلص", cancelled: "اتلغى" };
const d = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });

/** مهرجانات التخفيضات: أصناف بسعر عرض لمدة — الأسعار بتتغيّر وترجع لوحدها، والملصقات والتطبيق بيتظبطوا معاها */
export default async function Campaigns({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["promo.edit", "promo.approve", "promo.colors", "labels.hang", "pos.shift", "prices.edit"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: locs }, { data: n }, { data: cs }] = await Promise.all([
    sb.from("campaigns").select("*").order("starts_at", { ascending: false }).limit(100),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    sb.from("campaign_items").select("campaign_id"),
    sb.from("settings").select("value").eq("key", "campaigns.colors").maybeSingle(),
  ]);
  const colors = (Array.isArray(cs?.value) && cs.value.length ? cs.value : DEFAULT_COLORS) as LabelColor[];
  const cnt = (id: number) => (n ?? []).filter((x) => x.campaign_id === id).length;
  const L = (data ?? []) as C[];
  return (
    <>
      <div className="top"><h1>مهرجانات التخفيضات</h1><Link className="btn" href="/offers" style={{ display: "inline-grid", placeItems: "center" }}>العروض والبروموكود</Link></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      <div style={{ display: "grid", gap: 8 }}>
        {L.map((c) => (
          <Link key={c.id} href={`/offers/campaigns/${c.id}`} className="card" style={{ borderInlineStart: `6px solid ${c.color}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, borderRadius: 0 }}>
            <div><b>{c.name}</b>{c.subtitle && <span className="muted"> — {c.subtitle}</span>}<div className="muted" style={{ fontSize: 13 }}>{d(c.starts_at)} ← {d(c.ends_at)} · {cnt(c.id)} صنف · {c.locations?.length ? `${c.locations.length} فرع` : "كل الفروع"}</div></div>
            <span className="pill" style={c.status === "live" ? { background: c.color, color: "#fff" } : undefined}>{ST[c.status]}</span>
          </Link>
        ))}
        {!L.length && <div className="card muted">لسه مفيش مهرجانات</div>}
      </div>
      {can(me, "promo.edit") && <CampaignForm action={saveCampaign} locs={locs ?? []} colors={colors} />}
      {can(me, "promo.colors") && (
        <form action={saveColors} className="card" style={{ display: "grid", gap: 8 }}>
          <b>ألوان الملصقات ومعنى كل لون</b>
          <div className="muted" style={{ fontSize: 13 }}>اللي هتحدده هنا هو اللي هيظهر في فورم المهرجان. سيب المعنى فاضي لو مش عايز تربط اللون بنوع عرض.</div>
          {colors.map((x, i) => (
            <div key={i} className="row" style={{ gap: 8, alignItems: "center" }}>
              <input type="color" name="c" defaultValue={x.c} style={{ width: 44, height: 34, padding: 0, border: 0 }} />
              <input name="t" defaultValue={x.t} placeholder="المعنى (اختياري) — مثلاً: مهرجان كبير" style={{ flex: 1 }} maxLength={40} />
              <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" name="del" value={i} /> شيل</label>
            </div>))}
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <label className="muted" style={{ fontSize: 13 }}><input type="checkbox" name="add" /> ضيف لون</label>
            <input type="color" name="nc" defaultValue="#0EA5E9" style={{ width: 44, height: 34, padding: 0, border: 0 }} />
            <input name="nt" placeholder="معناه" style={{ flex: 1 }} maxLength={40} />
          </div>
          <button className="btn pri" style={{ justifySelf: "start" }}>حفظ الألوان</button>
        </form>)}
    </>
  );
}
