import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { money } from "@/lib/time";
import { mapCode, approveUpload } from "../../actions";

type Row = { code: string; name: string; item_id: number | null; file_qty: number; sys_qty: number | null; price: number; old_price: number | null; cost: number; pct: number; flag: string | null };
type V = { id: number; status: string; loc_name: string; partner: string; partner_id: number; at: string; rows: Row[]; missing: { item_id: number; name: string; sys_qty: number }[]; diff_alert_pct: number };
const F: Record<string, [string, string]> = { new: ["صنف جديد — اربطه", "#FDECEC"], price: ["السعر اتغيّر", "#FFF7E6"], diff: ["فرق كبير", "#FFF7E6"] };

/** مطابقة ملف الصبح: السيستم × الملف × الفرق — اربط الجديد، عدّل لو لازم، واعتمد */
export default async function UploadView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await getMe();
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("partner_upload_view", { p_id: Number(id) });
  if (error || !data) notFound();
  const v = data as V;
  const { data: items } = await sb.from("items").select("id,name").eq("active", true).order("name");
  const draft = v.status === "draft" && can(me, "partner.upload");
  const n = (f: string) => v.rows.filter((r) => r.flag === f).length;
  return (
    <>
      <div className="top"><h1>ملف {v.partner} — {v.loc_name}</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">{sp.ok}</div>}
      <div className="kpis">
        <div className="kpi"><span>أصناف في الملف</span><b className="num">{v.rows.length}</b></div>
        <div className={`kpi${n("new") ? " hl" : ""}`}><span>جديدة محتاجة ربط</span><b className="num">{n("new")}</b></div>
        <div className="kpi"><span>سعرها اتغيّر</span><b className="num">{n("price")}</b></div>
        <div className="kpi"><span>فرق أكتر من {v.diff_alert_pct}%</span><b className="num">{n("diff")}</b></div>
        <div className="kpi"><span>اختفت من الملف</span><b className="num">{v.missing.length}</b></div>
      </div>
      <form id="ap" action={approveUpload}><input type="hidden" name="id" value={v.id} /></form>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الصنف</th><th>السيستم</th><th>الملف</th><th>{draft ? "تعديل" : ""}</th><th>سعر الشريك</th><th>الخصم</th><th>تكلفتنا</th><th></th></tr></thead>
          <tbody>
            {v.rows.map((r) => (
              <tr key={r.code} style={{ background: r.flag ? F[r.flag][1] : undefined }}>
                <td><b>{r.name}</b> <span className="muted" dir="ltr" style={{ fontSize: 12 }}>{r.code}</span></td>
                <td className="num">{r.sys_qty ?? "—"}</td><td className="num"><b>{r.file_qty}</b></td>
                <td>{draft && r.item_id && <input form="ap" name={`fix:${r.code}`} inputMode="decimal" placeholder="—" style={{ width: 70 }} />}</td>
                <td className="num">{r.old_price != null && r.old_price !== r.price ? <><s className="muted">{money(r.old_price)}</s> </> : null}{money(r.price)}</td>
                <td className="num">{r.pct}%</td><td className="num">{money(r.cost)}</td>
                <td>{r.flag && <span className="pill">{F[r.flag][0]}</span>}
                  {draft && !r.item_id && (
                    <form action={mapCode} className="row" style={{ gap: 4, marginTop: 4 }}>
                      <input type="hidden" name="u" value={v.id} /><input type="hidden" name="partner" value={v.partner_id} /><input type="hidden" name="code" value={r.code} />
                      <select name="item" required defaultValue=""><option value="" disabled>صنفنا…</option>{(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                      <button className="btn" style={{ height: 30 }}>اربط</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!!v.missing.length && <div className="note">مش في الملف (رصيدها هيبقى صفر): {v.missing.map((m) => `${m.name} (${m.sys_qty})`).join("، ")}</div>}
      </div>
      {draft ? <button form="ap" className="btn pri" style={{ height: 48 }}>اعتمد الملف — الرصيد والأسعار والتكلفة يتحدّثوا</button>
        : <div className="note">{v.status === "approved" ? "الملف ده اتعمد." : "الملف ده اتلغى (اترفع ملف أحدث)."}</div>}
      {draft && n("new") > 0 && <div className="muted">الأصناف اللي مش مربوطة مش هتتحسب لحد ما تربطها.</div>}
    </>
  );
}
