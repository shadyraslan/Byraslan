import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";

type C = { id: number; kind: string; ref_id: number; ref_no: string | null; reason: string; detail: string | null; at: string; by: string | null; location_id: string | null };
const K: Record<string, string> = { order: "طلب أونلاين", trip: "رحلة", prod: "أمر إنتاج", po: "أمر توريد" };
const HREF: Record<string, (id: number) => string> = { order: (id) => `/orders/${id}`, trip: (id) => `/trips/${id}`, prod: () => "/production", po: () => "/purchasing" };

/** كل الإلغاءات وأسبابها — للمالك واللي معاه صلاحية «الإلغاءات» */
export default async function Cancellations({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const me = await getMe();
  if (!me?.isOwner && !can(me, "cancels.view")) redirect("/dashboard");
  const sb = await supabaseServer();
  let q = sb.from("cancellations").select("id,kind,ref_id,ref_no,reason,detail,at,by,location_id").order("id", { ascending: false }).limit(300);
  if (k) q = q.eq("kind", k);
  const [{ data }, { data: people }, { data: locs }] = await Promise.all([q, sb.from("profiles").select("id,name"), sb.from("locations").select("id,name")]);
  const P = new Map((people ?? []).map((p) => [p.id as string, p.name as string]));
  const L = new Map((locs ?? []).map((l) => [l.id as string, l.name as string]));
  const rows = (data ?? []) as C[];
  return (
    <>
      <div className="top"><h1>الإلغاءات وأسبابها</h1></div>
      <div className="row" style={{ marginBottom: 10 }}>
        <Link className={`btn${!k ? " pri" : ""}`} href="/cancellations">الكل</Link>
        {Object.entries(K).map(([x, t]) => <Link key={x} className={`btn${k === x ? " pri" : ""}`} href={`/cancellations?k=${x}`}>{t}</Link>)}
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الوقت</th><th>إيه اللي اتلغى</th><th>السبب</th><th>مين</th><th>تفاصيل</th></tr></thead>
          <tbody>{rows.map((c) => (
            <tr key={c.id}>
              <td className="num" style={{ fontSize: 12.5 }}>{new Date(c.at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short", timeZone: "Africa/Cairo" })}</td>
              <td><Link href={HREF[c.kind]?.(c.ref_id) ?? "#"}>{K[c.kind] ?? c.kind} {c.ref_no}</Link>{c.location_id && <div className="muted" style={{ fontSize: 12 }}>{L.get(c.location_id) ?? c.location_id}</div>}</td>
              <td><b>{c.reason}</b></td>
              <td>{c.by ? P.get(c.by) ?? "—" : "السيستم"}</td>
              <td className="muted" style={{ fontSize: 12.5 }}>{c.detail}</td>
            </tr>))}
            {!rows.length && <tr><td colSpan={5} className="muted">مفيش إلغاءات</td></tr>}
          </tbody>
        </table>
        <div className="note" style={{ marginTop: 8 }}>كل إلغاء لطلب أو رحلة أو أمر إنتاج أو أمر توريد لازم يتكتب سببه، وبيوصل رسالة للمالك ولأي حد معاه صلاحية «الإلغاءات».</div>
      </div>
    </>
  );
}
