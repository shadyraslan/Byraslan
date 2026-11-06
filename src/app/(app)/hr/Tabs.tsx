import Link from "next/link";
const T: [string, string][] = [
  ["/hr", "الحضور"], ["/hr/hours", "الساعات والأيام"], ["/hr/shifts", "الورديات والأذون"], ["/hr/leaves", "الإجازات والسلف"], ["/hr/days", "أيام الإجازة"], ["/hr/payroll", "المرتبات"], ["/hr/appraisals", "تقييم الأداء"], ["/hr/custody", "العهد"], ["/hr/requests", "الاعتراضات والأوراق"],
  ["/hr/messages", "رسايل الموظفين"], ["/hr/policy", "نص اللايحة"], ["/hr/rules", "اللايحة والأرصدة"], ["/users", "الموظفين والصلاحيات"], ["/locations", "أماكن الحضور"],
];
export default function Tabs({ cur }: { cur: string }) {
  return <div className="row" style={{ marginBottom: 12 }}>{T.map(([h, l]) => <Link key={h} href={h} className={h === cur ? "btn pri" : "btn"} style={{ display: "inline-grid", placeItems: "center" }}>{l}</Link>)}</div>;
}
/** رسالة النجاح أو الغلط اللي راجعة من الأكشن */
export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <div className="badmsg" style={{ marginBottom: 12 }}>{sp.err}</div>;
  if (sp.ok) return <div className="okmsg" style={{ marginBottom: 12 }}>{sp.ok}</div>;
  return null;
}
