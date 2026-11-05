import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Station, { type Job } from "./Station";

type S = { order_id: number; step: number; section_id: string; status: string; in_weight: number | null; out_weight: number | null };
type O = { id: number; no: number; qty: number; status: string; items: { name: string; unit: string } | { name: string; unit: string }[] | null; prod_steps: S[] };
const one = <X,>(v: X | X[] | null | undefined): X | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export default async function StationPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { room = "" } = await searchParams;
  const me = await getMe();
  if (!can(me, "prod.orders")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: secs }, { data: orders }] = await Promise.all([
    sb.from("locations").select("id,name").eq("type", "section").eq("active", true).order("sort"),
    sb.from("prod_orders").select("id,no,qty,status,items(name,unit),prod_steps(order_id,step,section_id,status,in_weight,out_weight)").in("status", ["planned", "running"]).order("due").order("id"),
  ]);
  const jobs: Job[] = [];
  if (room)
    for (const o of (orders ?? []) as unknown as O[]) {
      const steps = [...o.prod_steps].sort((a, b) => a.step - b.step);
      const cur = steps.find((s) => s.status !== "done");
      if (!cur || cur.section_id !== room) continue;
      const prev = steps.filter((s) => s.step < cur.step).pop();
      const it = one(o.items);
      jobs.push({ order: o.id, no: o.no, step: cur.step, item: it?.name ?? "", unit: it?.unit ?? "", qty: Number(o.qty), status: cur.status, in_weight: cur.in_weight, prev_out: prev?.out_weight ?? null, last: steps[steps.length - 1].step === cur.step });
    }
  const roomName = (secs ?? []).find((s) => s.id === room)?.name;
  return (
    <>
      <div className="top"><h1>تابلت الغرف{roomName ? ` — ${roomName}` : ""}</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>
        {(secs ?? []).map((s) => <Link key={s.id} href={`/station?room=${s.id}`} className={s.id === room ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center", height: 48, fontSize: 16 }}>{s.name}</Link>)}
      </div>
      {room ? <Station jobs={jobs} /> : <div className="card muted" style={{ fontSize: 17 }}>اختار الغرفة اللي التابلت ده فيها — وبعدين احفظ الصفحة على الشاشة الرئيسية للتابلت.</div>}
    </>
  );
}
