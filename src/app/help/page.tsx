import { supabaseServer } from "@/lib/supabase/server";
import Help from "./Help";

export const metadata = { title: "خدمة عملاء باي رسلان" };

/** خدمة العملاء على الويب: منيو + تذاكر + شات — من غير تطبيق ولا تسجيل */
export default async function HelpPage({ searchParams }: { searchParams: Promise<{ t?: string; o?: string }> }) {
  const sp = await searchParams;
  const sb = await supabaseServer();
  const { data } = await sb.rpc("app_config");
  const sup = ((data ?? {}) as { support?: { whatsapp?: string; phone?: string; hours?: string; faq?: [string, string][] } }).support ?? {};
  return (
    <div className="shop">
      <header className="shophead"><img src="/logo.png" alt="By Raslan" /><b>خدمة العملاء</b><a href="/order" style={{ marginInlineStart: "auto", color: "inherit", fontSize: 14 }}>🛒 اطلب</a></header>
      <Help support={sup} openToken={sp.t ?? null} orderToken={sp.o ?? null} />
    </div>
  );
}
