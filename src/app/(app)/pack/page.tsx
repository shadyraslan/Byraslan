import { redirect } from "next/navigation";
import { getMe, can } from "@/lib/perms";
import PackStation from "./PackStation";

export default async function Pack() {
  const me = await getMe();
  if (!can(me, "prod.pack")) redirect("/dashboard");
  return (
    <>
      <div className="top noprint"><h1>محطة التغليف</h1><span className="pill">الميزان ← علبة برقم ← QR</span></div>
      <PackStation />
    </>
  );
}
