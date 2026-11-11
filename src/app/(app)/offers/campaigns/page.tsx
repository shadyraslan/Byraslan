import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { saveCampaign } from "./actions";
import CampaignForm from "./CampaignForm";

type C = { id: number; name: string; subtitle: string | null; color: string; starts_at: string; ends_at: string; status: string; locations: string[] | null };
export const dynamic = "force-dynamic";
const ST: Record<string, string> = { draft: "مسودة", pending: "مستني اعتماد", approved: "متعمد — مستني ميعاده", live: "شغال دلوقتي", ended: "خلص", cancelled: "اتلغى" };
const d = (s: string) => new Date(s).toLocaleString("ar-EG", { timeZone: "Africa/Cairo", day: "numeric", month: "numeric", hour: "numeric", minute: "2-digit" });

/** مهرجانات التخفيضات: أصناف بسعر عرض لمدة — الأسعار بتتغيّر وترجع لوحدها، والملصقات والتطبيق بيتظبطوا معاها */
export default async function Campaigns({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!["promo.edit", "promo.approve", "labels.hang", "pos.shift", "prices.edit"].some((p) => can(me, p))) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: locs }, { data: n }] = await Promise.all([
    sb.from("campaigns").select("*").order("starts_at", { ascending: false }).limit(100),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
    sb.from("campaign_items").select("campaign_id"),
  ]);
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
      {can(me, "promo.edit") && <CampaignForm action={saveCampaign} locs={locs ?? []} />}
    </>
  );
}
