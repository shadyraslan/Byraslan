import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { tripState } from "../actions";
import Loading from "./Loading";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!can(me, "trips.load")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: t } = await sb.from("trips").select("id,no,truck,driver,status,left_at").eq("id", Number(id)).maybeSingle();
  if (!t) notFound();
  const [{ data: br }, st] = await Promise.all([
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop", "warehouse", "sub"]).order("sort"),
    tripState(t.id),
  ]);
  return (
    <>
      <div className="crumbs"><Link href="/trips">العربيات</Link> ‹ <span>رحلة #{t.no}</span></div>
      <div className="top"><h1>رحلة #{t.no} — {t.truck}{t.driver ? ` · ${t.driver}` : ""}</h1><span className="pill">{t.status === "loading" ? "بتتحمّل" : "خرجت"}</span></div>
      {t.status === "loading" ? (
        <Loading trip={t.id} branches={(br ?? []).filter((b) => b.id !== "main")} initial={st} />
      ) : (
        <div className="card">
          <h2>العربية خرجت {t.left_at ? new Date(t.left_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : ""}</h2>
          {st.map((c) => <div key={c.crate}><b>{c.crate}</b> ← {(br ?? []).find((b) => b.id === c.to_loc)?.name ?? c.to_loc} · {c.boxes.length} علبة</div>)}
          <Link className="btn" href="/transfers" style={{ display: "inline-grid", placeItems: "center" }}>التحويلات والاستلام</Link>
        </div>
      )}
    </>
  );
}
