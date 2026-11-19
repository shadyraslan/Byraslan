import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getMe, can } from "@/lib/perms";
import { supabaseServer } from "@/lib/supabase/server";
import CrateLabels from "./CrateLabels";

async function addCrates(fd: FormData) {
  "use server";
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc("crates_add", { p_n: Number(fd.get("n") || 0) });
  revalidatePath("/crates");
  redirect(`/crates?${error ? `err=${encodeURIComponent(error.message.replace(/^.*?ERROR:\s*/, ""))}` : `ok=${encodeURIComponent(`اتعمل ${data} — اطبعهم`)}`}`);
}

/** ملصقات الصناديق البلاستيك: كل صندوق ليه كود ثابت CR-001… بيتطبع مرة ويتلزق على الصندوق */
export default async function Crates({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const me = await getMe();
  if (!(can(me, "stock.view") || can(me, "trips.load"))) redirect("/dashboard");
  const sb = await supabaseServer();
  const { data } = await sb.from("crates").select("id").eq("active", true).like("id", "CR-%").order("id");
  return (
    <>
      <div className="top noprint"><h1>ملصقات الصناديق البلاستيك</h1></div>
      <div className="card noprint" style={{ display: "grid", gap: 6 }}>
        <div className="muted">كل صندوق بلاستيك ليه كود ثابت (CR-001، CR-002…) بيتطبع مرة ويتلزق عليه. وقت التحميل بتمسح الصندوق وتختار هو لأنهي فرع، وبعدين تمسح العلب اللي جواه. الفرع بيستلم الصندوق كله بمسحة واحدة. لو مش عايز صناديق: في صفحة الرحلة «من غير صندوق» وتختار الفرع على طول.</div>
        {sp.ok && <div className="okmsg">{sp.ok}</div>}
        {sp.err && <div className="badmsg">{sp.err}</div>}
        {(can(me, "trips.load") || can(me, "stock.edit")) && (
          <form action={addCrates} className="row" style={{ alignItems: "end" }}>
            <label className="fld">صناديق جديدة كام؟<input name="n" defaultValue="10" inputMode="numeric" dir="ltr" style={{ width: 80 }} /></label>
            <button className="btn pri">اعمل أكواد جديدة</button>
            <span className="muted">عندك دلوقتي {(data ?? []).length} صندوق</span>
          </form>
        )}
      </div>
      <CrateLabels ids={(data ?? []).map((c) => c.id as string)} />
    </>
  );
}
