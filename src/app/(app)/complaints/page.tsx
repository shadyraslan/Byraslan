import Link from "next/link";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { need } from "@/lib/perms";

async function close(fd: FormData) {
  "use server";
  await need("orders.handle", "cs.agent");
  const sb = await supabaseServer();
  await sb.from("app_complaints").update({ status: "done" }).eq("id", Number(fd.get("id")));
  revalidatePath("/complaints");
}

type Row = { id: number; reason: string; details: string | null; status: string; at: string; online_orders: { id: number; no: number; customers: { name: string; phone: string } | null; locations: { name: string } | null } | null };

export default async function Complaints() {
  const sb = await supabaseServer();
  const { data } = await sb.from("app_complaints").select("id,reason,details,status,at,online_orders(id,no,customers(name,phone),locations(name))").order("id", { ascending: false }).limit(100);
  const R = (data ?? []) as unknown as Row[];
  return (
    <>
      <div className="top"><h1>شكاوى التطبيق {R.filter((r) => r.status === "new").length ? `· ${R.filter((r) => r.status === "new").length} جديدة` : ""}</h1></div>
      {R.map((r) => (
        <div key={r.id} className="card" style={{ borderInlineStart: `4px solid ${r.status === "new" ? "var(--bad)" : "var(--line)"}` }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{r.reason}</b>
            <span className="muted num">{new Date(r.at).toLocaleString("ar-EG", { timeZone: "Africa/Cairo" })}</span>
          </div>
          {r.details && <div>{r.details}</div>}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span>طلب <Link href={`/orders/${r.online_orders?.id}`}><b className="num">#{r.online_orders?.no}</b></Link> · {r.online_orders?.customers?.name} <a className="num" href={`tel:${r.online_orders?.customers?.phone}`}>{r.online_orders?.customers?.phone}</a> · فرع {r.online_orders?.locations?.name}</span>
            {r.status === "new" ? <form action={close}><input type="hidden" name="id" value={r.id} /><button className="btn pri" style={{ height: 34 }}>اتحلّت</button></form> : <span className="muted">اتحلّت</span>}
          </div>
        </div>
      ))}
      {!R.length && <div className="card muted">مفيش شكاوى</div>}
    </>
  );
}
