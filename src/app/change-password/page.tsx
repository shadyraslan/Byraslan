import { redirect } from "next/navigation";
import { getMe } from "@/lib/perms";
import ChangeForm from "./ChangeForm";

/** أول دخول بالرقم السري المبدئي (123): لازم الموظف يختار رقم سري جديد قبل ما يدخل السيستم */
export default async function ChangePassword() {
  const me = await getMe();
  if (!me) redirect("/login");
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "100%", maxWidth: 380, display: "grid", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>أهلاً {me.name}</h1>
        <div className="muted">{me.mustChange ? "ده أول دخول ليك بالرقم السري المبدئي — اختار رقم سري جديد بتاعك عشان تكمّل." : "غيّر الرقم السري بتاعك."}</div>
        <ChangeForm />
      </div>
    </main>
  );
}
