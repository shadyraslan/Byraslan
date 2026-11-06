import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

// زرار "تخطّي" في تطبيق الموظفين: بيعمل/يرجّع "موظف تجربة" للموبايل ده — بيشتغل بس طول ما وضع التجربة شغال،
// والحساب ده بيتقفل لوحده (is_staff) أول ما وضع التجربة يتقفل من الإعدادات.
export async function POST(req: Request) {
  const admin = supabaseAdmin();
  if (!admin) return NextResponse.json({ error: "السيرفر لسه مش متظبط" }, { status: 500 });
  const { data: tm } = await admin.from("settings").select("value").eq("key", "app.test_mode").maybeSingle();
  if (tm?.value !== true) return NextResponse.json({ error: "وضع التجربة مقفول — ادخل بموبايلك والرقم السري" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { device?: string };
  const dev = String(body.device ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || randomBytes(6).toString("hex");
  const email = `test-${dev.toLowerCase()}@staff.byraslan.app`;
  const password = randomBytes(18).toString("base64url");
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users.find((u) => u.email === email);
  if (user) {
    await admin.auth.admin.updateUserById(user.id, { password });
  } else {
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "موظف تجربة" }, app_metadata: { staff: true } });
    if (error || !data.user) return NextResponse.json({ error: error?.message ?? "ماتعملش" }, { status: 500 });
    user = data.user;
    const { data: loc } = await admin.from("locations").select("id").eq("type", "dark").eq("active", true).order("sort").limit(1).maybeSingle();
    await admin.from("profiles").update({ name: "موظف تجربة", job: "تجربة", is_test: true, home_loc: loc?.id ?? null }).eq("id", user.id);
    // عشان يجرّب كل حاجة في التطبيق: سواق + بيشوف رحلاته
    await admin.from("grants").insert([{ user_id: user.id, perm: "trips.load" }]);
  }
  return NextResponse.json({ email, password });
}
