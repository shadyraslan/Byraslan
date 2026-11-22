import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { tripState } from "../actions";
import Loading from "./Loading";
import { ArriveButton, AddStop } from "./Arrive";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!can(me, "trips.load")) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data: t } = await sb.from("trips").select("id,no,truck,driver,status,left_at,stops").eq("id", Number(id)).maybeSingle();
  if (!t) notFound();
  const [{ data: br }, st, { data: trs }] = await Promise.all([
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop", "warehouse", "sub", "partner"]).order("sort"),
    tripState(t.id),
    sb.from("transfers").select("id,to_loc,status,recv_at,transfer_boxes(state)").eq("trip_id", t.id),
  ]);
  const all = (br ?? []).filter((b) => b.id !== "main");
  const stops = (t.stops ?? []) as string[];
  // الرحلة بتروح للفروع اللي اتختارت بس (الرحلات القديمة من غير اختيار بتعرض كل الفروع)
  const mine = stops.length ? stops.map((s) => all.find((b) => b.id === s)).filter(Boolean) as { id: string; name: string }[] : all;
  const ln = (x: string) => (br ?? []).find((b) => b.id === x)?.name ?? x;
  type Tr = { id: number; to_loc: string; status: string; recv_at: string | null; transfer_boxes: { state: string }[] };
  const T = (trs ?? []) as unknown as Tr[];
  const dests = [...new Set(T.map((x) => x.to_loc))];
  return (
    <>
      <div className="crumbs"><Link href="/trips">العربيات</Link> ‹ <span>رحلة #{t.no}</span></div>
      <div className="top"><h1>رحلة #{t.no} — {t.truck}{t.driver ? ` · ${t.driver}` : ""}</h1><span className="pill">{t.status === "loading" ? "بتتحمّل" : "خرجت"}</span></div>
      <div className="card row" style={{ gap: 8, alignItems: "center" }}>
        <b>الفروع:</b> {mine.map((b) => <span key={b.id} className="pill">{b.name}</span>)}
        {t.status === "loading" && <AddStop trip={t.id} options={all.filter((b) => !mine.some((m) => m.id === b.id))} />}
      </div>
      {t.status === "loading" ? (
        <Loading trip={t.id} branches={mine} initial={st} />
      ) : (
        <div className="card">
          <h2>العربية خرجت {t.left_at ? new Date(t.left_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" }) : ""}</h2>
          {st.map((c) => <div key={c.crate}><b>{c.crate.startsWith("NC-") ? "من غير صندوق" : c.crate}</b> ← {ln(c.to_loc)} · {c.boxes.length} طبق</div>)}
          <h2 style={{ marginTop: 14 }}>وصول الفروع</h2>
          {dests.map((d) => {
            const mineT = T.filter((x) => x.to_loc === d);
            const open = mineT.filter((x) => x.status === "transit");
            const n = mineT.reduce((a, x) => a + x.transfer_boxes.length, 0);
            const miss = mineT.reduce((a, x) => a + x.transfer_boxes.filter((b) => b.state === "missing").length, 0);
            return (
              <div key={d} className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                <b style={{ minWidth: 110 }}>{ln(d)}</b>
                {open.length ? <ArriveButton trip={t.id} loc={d} name={ln(d)} boxes={n} /> : <span className="pill" style={{ color: "var(--good)" }}>✓ وصلت {mineT[0]?.recv_at ? new Date(mineT[0].recv_at).toLocaleString("en-GB", { timeStyle: "short", dateStyle: "short" }) : ""}{miss ? ` · ناقص ${miss}` : ""}</span>}
              </div>);
          })}
          {!dests.length && <div className="muted">مفيش تحويلات على الرحلة دي</div>}
          <div className="note">الاستلام هنا تأكيد وصول بس: زرار واحد لكل فرع بيدخّل كل الأطباق اللي اتحمّلت له الرصيد. لو فيه طبق ناقص فعلاً اتعامل معاه من «تتبّع علبة».</div>
        </div>
      )}
    </>
  );
}
