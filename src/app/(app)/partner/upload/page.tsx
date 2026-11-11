import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe, can } from "@/lib/perms";
import Upload from "./Upload";

export default async function UploadPage() {
  const me = await getMe();
  if (!can(me, "partner.upload")) redirect("/partner");
  const sb = await supabaseServer();
  const [{ data: pbs }, { data: ps }, { data: locs }] = await Promise.all([
    sb.from("partner_branches").select("location_id,partner_id"),
    sb.from("partners").select("id,name,file_map").eq("active", true),
    sb.from("locations").select("id,name").eq("type", "partner"),
  ]);
  const LN = new Map((locs ?? []).map((l) => [l.id, l.name]));
  const opts = (pbs ?? []).map((b) => { const p = (ps ?? []).find((x) => x.id === b.partner_id); return { loc: b.location_id, name: `${p?.name ?? ""} — ${LN.get(b.location_id) ?? b.location_id}`, map: (p?.file_map ?? {}) as Record<string, string> }; });
  return (
    <>
      <div className="top"><h1>رفع ملف الصبح</h1></div>
      <Upload opts={opts} />
      <div className="note">رصيد الملف بيحل محل الرصيد القديم بالكامل (مبيعات امبارح مخصومة عند الشريك أصلاً). بعد الرفع هتشوف المطابقة: الأصناف الجديدة، اللي اختفت، الفروق الكبيرة، وتغيّر الأسعار — وتقدر تعدّل قبل الاعتماد.</div>
    </>
  );
}
