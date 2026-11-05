import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Receive from "./Receive";

type TB = { box_sn: number; state: string; boxes: { weight: number; crate: string | null; items: { name: string; unit: string } | { name: string; unit: string }[] | null } | null };
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const ST: Record<string, string> = { sent: "مبعوتة", received: "اتسلّمت", missing: "ناقصة", found: "اتلقت", lost: "ضاعت" };

export default async function TransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  const sb = await supabaseServer();
  const { data: t } = await sb.from("transfers").select("id,no,from_loc,to_loc,status,reason,note,sent_at,recv_at,transfer_boxes(box_sn,state,boxes(weight,crate,items(name,unit)))").eq("id", Number(id)).maybeSingle();
  if (!t) notFound();
  const { data: locs } = await sb.from("locations").select("id,name").in("id", [t.from_loc, t.to_loc]);
  const ln = (x: string) => (locs ?? []).find((l) => l.id === x)?.name ?? x;
  const rows = ((t.transfer_boxes ?? []) as unknown as TB[]).map((r) => {
    const b = one(r.boxes);
    const it = one(b?.items);
    return { sn: r.box_sn, state: r.state, item: it?.name ?? "", unit: it?.unit ?? "", weight: Number(b?.weight ?? 0), crate: b?.crate ?? null };
  });
  return (
    <>
      <div className="crumbs"><Link href="/transfers">التحويلات</Link> ‹ <span>#{t.no}</span></div>
      <div className="top"><h1>تحويل #{t.no}: {ln(t.from_loc)} ← {ln(t.to_loc)}</h1><span className="pill">{t.status === "transit" ? "في الطريق" : "اتسلّم"}</span></div>
      {t.status === "transit" && can(me, "stock.edit") && <Receive id={t.id} boxes={rows} />}
      <div className="card" style={{ overflowX: "auto" }}>
        <h2>العلب</h2>
        <table>
          <thead><tr><th>رقم العلبة</th><th>الصنف</th><th>الوزن</th><th>الصندوق</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sn}><td className="num"><b>#{r.sn}</b></td><td>{r.item}</td><td className="num">{r.weight} {r.unit}</td><td className="num">{r.crate ?? "—"}</td><td style={r.state === "missing" ? { color: "var(--bad)", fontWeight: 700 } : {}}>{ST[r.state] ?? r.state}{r.state === "missing" && <> · <Link href={`/boxes?sn=${r.sn}`}>احسمها</Link></>}</td></tr>
            ))}
          </tbody>
        </table>
        {t.reason && <div className="muted">السبب: {t.reason}{t.note ? ` · ${t.note}` : ""}</div>}
      </div>
    </>
  );
}
