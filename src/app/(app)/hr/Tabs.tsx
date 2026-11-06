import Link from "next/link";
const T: [string, string][] = [
  ["/hr", "الحضور"], ["/hr/hours", "الساعات والأيام"], ["/hr/shifts", "الورديات والأذون"], ["/hr/leaves", "الإجازات والسلف"], ["/hr/days", "أيام الإجازة"], ["/hr/payroll", "المرتبات"], ["/hr/appraisals", "تقييم الأداء"], ["/hr/custody", "العهد"], ["/hr/requests", "الاعتراضات والأوراق"],
  ["/hr/messages", "رسايل الموظفين"], ["/hr/policy", "نص اللايحة"], ["/hr/rules", "اللايحة والأرصدة"], ["/users", "الموظفين والصلاحيات"], ["/locations", "أماكن الحضور"],
];
export default function Tabs({ cur }: { cur: string }) {
  // القايمة الجانبية بقت فيها شاشات القسم — مفيش صف أزرار فوق
  void cur; void T; void Link;
  return null;
}
/** رسالة النجاح أو الغلط اللي راجعة من الأكشن */
export function Flash({ sp }: { sp: { ok?: string; err?: string } }) {
  if (sp.err) return <div className="badmsg" style={{ marginBottom: 12 }}>{sp.err}</div>;
  if (sp.ok) return <div className="okmsg" style={{ marginBottom: 12 }}>{sp.ok}</div>;
  return null;
}
