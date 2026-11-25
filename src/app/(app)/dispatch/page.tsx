import { redirect } from "next/navigation";

// الديسباتشر صفحة واحدة بقت: /partner/dispatch
export default function DispatchPage() { redirect("/partner/dispatch?t=market"); }
