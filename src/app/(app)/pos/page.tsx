import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import { openShift } from "./actions";
import Pos from "./Pos";

export default async function PosPage() {
  const me = await getMe();
  if (!me || !can(me, "pos.sell")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data: sh }, { data: locs }] = await Promise.all([
    sb.from("shifts").select("id,location_id,opened_at").eq("cashier", me.id).eq("status", "open").maybeSingle(),
    sb.from("locations").select("id,name").eq("active", true).in("type", ["dark", "shop"]).order("sort"),
  ]);
  if (!sh)
    return (
      <>
        <div className="top"><h1>الكاشير</h1></div>
        <form action={openShift} className="card row">
          <label className="fld">الفرع<select name="loc" defaultValue={me.home ?? ""}>{(locs ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
          <label className="fld">الكاش في الدرج أول الوردية<input name="cash" inputMode="decimal" dir="ltr" defaultValue="0" /></label>
          <button className="btn pri" style={{ height: 48 }}>افتح الوردية</button>
        </form>
      </>
    );
  const locName = (locs ?? []).find((l) => l.id === sh.location_id)?.name ?? sh.location_id;
  return (
    <>
      <div className="top noprint"><h1>الكاشير</h1><span className="pill">وردية من {new Date(sh.opened_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span></div>
      <Pos shift={sh.id} loc={sh.location_id} locName={locName} cashier={me.name} canDiscount={can(me, "pos.discount")} />
    </>
  );
}
