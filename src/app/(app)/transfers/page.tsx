import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { ArriveButton } from "../trips/[id]/Arrive";

type T = { id: number; no: number; from_loc: string; to_loc: string; status: string; reason: string | null; sent_at: string; trip_id: number | null; trips: { no: number; truck: string } | null; transfer_boxes: { state: string }[] };

export default async function Transfers() {
  const me = await getMe();
  if (!can(me, "stock.view") && !can(me, "stock.edit")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: tr }, { data: locs }] = await Promise.all([
    sb.from("transfers").select("id,no,from_loc,to_loc,status,reason,sent_at,trip_id,trips(no,truck),transfer_boxes(state)").order("id", { ascending: false }).limit(100),
    sb.from("locations").select("id,name"),
  ]);
  const ln = (id: string) => (locs ?? []).find((l) => l.id === id)?.name ?? id;
  return (
    <>
      <div className="top"><h1>التحويلات</h1>{can(me, "stock.edit") && <Link className="btn pri" href="/transfers/new" style={{ display: "inline-grid", placeItems: "center" }}>+ تحويل بالمسح</Link>}</div>
      {(() => {
        const open = ((tr ?? []) as unknown as T[]).filter((t) => t.status === "transit" && t.trip_id);
        const groups = [...new Map(open.map((t) => [`${t.trip_id}|${t.to_loc}`, t])).values()];
        if (!groups.length) return null;
        return (
          <div className="card" style={{ border: "2px solid var(--y)" }}>
            <h2 style={{ marginTop: 0 }}>رحلات في الطريق — أكّد الوصول</h2>
            {groups.map((g) => {
              const n = open.filter((t) => t.trip_id === g.trip_id && t.to_loc === g.to_loc).reduce((a, t) => a + t.transfer_boxes.length, 0);
              return (
                <div key={`${g.trip_id}-${g.to_loc}`} className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <span style={{ minWidth: 200 }}>رحلة <b className="num">#{g.trips?.no}</b> {g.trips?.truck ? `· ${g.trips.truck}` : ""} ← <b>{ln(g.to_loc)}</b></span>
                  <ArriveButton trip={g.trip_id!} loc={g.to_loc} name={ln(g.to_loc)} boxes={n} />
                </div>);
            })}
            <div className="muted" style={{ fontSize: 12.5 }}>زرار واحد بيأكد إن العربية وصلت ويدخّل كل أطباقها رصيد الفرع.</div>
          </div>);
      })()}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>رقم</th><th>من ← إلى</th><th>العلب</th><th>الحالة</th><th>الوقت</th><th></th></tr></thead>
          <tbody>
            {((tr ?? []) as unknown as T[]).map((t) => {
              const miss = t.transfer_boxes.filter((b) => b.state === "missing").length;
              return (
                <tr key={t.id}>
                  <td className="num">#{t.no}</td>
                  <td><b>{ln(t.from_loc)}</b> ← <b>{ln(t.to_loc)}</b>{t.reason && <div className="muted" style={{ fontSize: 12 }}>{t.reason}</div>}</td>
                  <td className="num">{t.transfer_boxes.length}</td>
                  <td>{t.status === "transit" ? <span className="pill">في الطريق</span> : <span className="pill">اتسلّم</span>}{miss > 0 && <div style={{ color: "var(--bad)", fontWeight: 700, fontSize: 12 }}>ناقص {miss} علبة</div>}</td>
                  <td className="num" style={{ fontSize: 12 }}>{new Date(t.sent_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td><Link className="btn" href={`/transfers/${t.id}`} style={{ display: "inline-grid", placeItems: "center", height: 32 }}>{t.status === "transit" ? "استلام" : "اعرض"}</Link></td>
                </tr>
              );
            })}
            {!tr?.length && <tr><td colSpan={6} className="muted">لسه مفيش تحويلات</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
