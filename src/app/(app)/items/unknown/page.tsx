import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can, need } from "@/lib/perms";
import { money } from "@/lib/time";

async function link(fd: FormData) {
  "use server";
  await need("items.edit");
  const sb = await supabaseServer();
  const { error } = await sb.rpc("unknown_resolve", { p_code: String(fd.get("code")), p_item: Number(fd.get("item")) });
  revalidatePath("/items/unknown");
  redirect(`/items/unknown?${error ? `err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : "ok=1"}`);
}

/** باركودات اتمسحت في الكاشير ومش متسجّلة ← اربطها بصنف فتتعرف بعد كده */
export default async function Unknown({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!can(me, "items.edit") && !can(me, "pos.shift")) redirect("/dashboard");
  const sb = await supabaseServer();
  const [{ data }, { data: items }, { data: locs }] = await Promise.all([
    sb.from("unknown_scans").select("code,location_id,price,at").is("resolved_item", null).order("at", { ascending: false }).limit(500),
    sb.from("items").select("id,name").eq("active", true).order("name"),
    sb.from("locations").select("id,name"),
  ]);
  const LN = new Map((locs ?? []).map((l) => [l.id, l.name]));
  const G = new Map<string, { n: number; price: number | null; at: string; locs: Set<string> }>();
  for (const x of data ?? []) { const g = G.get(x.code) ?? { n: 0, price: x.price, at: x.at, locs: new Set<string>() }; g.n++; if (x.location_id) g.locs.add(LN.get(x.location_id) ?? x.location_id); G.set(x.code, g); }
  return (
    <>
      <div className="top"><h1>باركودات مش معروفة</h1></div>
      {sp.err && <div className="badmsg">{sp.err}</div>}
      {sp.ok && <div className="okmsg">اتربط — الكاشير هيعرفه من دلوقتي</div>}
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead><tr><th>الباركود</th><th>اتباع</th><th>آخر سعر يدوي</th><th>فين</th><th>{can(me, "items.edit") ? "اربطه بصنف" : ""}</th></tr></thead>
          <tbody>{[...G.entries()].map(([code, g]) => (
            <tr key={code}>
              <td dir="ltr"><b>{code}</b></td><td className="num">{g.n} مرة</td><td className="num">{g.price != null ? `${money(Number(g.price))} ج` : ""}</td><td>{[...g.locs].join("، ")}</td>
              <td>{can(me, "items.edit") && <form action={link} className="row" style={{ gap: 4 }}><input type="hidden" name="code" value={code} />
                <select name="item" required defaultValue=""><option value="" disabled>الصنف…</option>{(items ?? []).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                <button className="btn">اربط</button></form>}</td>
            </tr>
          ))}{!G.size && <tr><td colSpan={5} className="muted">مفيش باركودات مش معروفة 👌</td></tr>}</tbody>
        </table>
        <div className="note">صنف جديد خالص؟ ضيفه من الإكسل بالباركود ده وهيختفي من هنا لوحده.</div>
      </div>
    </>
  );
}
