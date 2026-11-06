/** قايمة السيستم: كل قسم ليه صفحة رئيسية (/sec/id) بأيقوناته وأرقامه ورسومه، وكل رابط بالصلاحيات اللي تفتحه (فاضي = أي موظف). المالك بيشوف كله. */
export type NavLink = { href: string; label: string; icon: string; color: string; perms?: string[] };
export type NavGroup = { id: string; title: string; icon: string; color: string; links: NavLink[] };

export const NAV: NavGroup[] = [
  { id: "cs", title: "خدمة العملاء", icon: "chat", color: "#16a34a", links: [
    { href: "/cs", label: "الرسايل والتذاكر", icon: "chat", color: "#16a34a", perms: ["cs.agent", "cs.manage"] },
    { href: "/cs/new", label: "طلب أو حجز جديد", icon: "phone", color: "#059669", perms: ["cs.agent", "orders.handle"] },
    { href: "/cs/orders", label: "متابعة الطلبات وتعديل الحجوزات", icon: "search", color: "#0ea5e9", perms: ["cs.agent", "orders.handle"] },
    { href: "/cs/customers", label: "العملاء", icon: "hr", color: "#7c3aed", perms: ["cs.agent", "orders.handle"] },
    { href: "/complaints", label: "الشكاوى والتعويضات", icon: "warning", color: "#e11d48", perms: ["orders.handle", "cs.agent"] },
  ] },
  { id: "orders", title: "الطلبات والتوصيل", icon: "app", color: "#0ea5e9", links: [
    { href: "/orders", label: "طلبات الأونلاين", icon: "orders", color: "#0ea5e9", perms: ["orders.handle"] },
    { href: "/bookings", label: "تقارير الحجوزات", icon: "calendar", color: "#7c3aed", perms: ["orders.handle", "orders.booking", "cs.agent"] },
    { href: "/zones", label: "مناطق التوصيل", icon: "map", color: "#0891b2", perms: ["settings.edit"] },
    { href: "/notify", label: "إشعارات ورسايل العملاء", icon: "bell", color: "#f59e0b", perms: ["notify.send"] },
  ] },
  { id: "branches", title: "الفروع والكاشير", icon: "store", color: "#16a34a", links: [
    { href: "/cashier", label: "الكاشير", icon: "pos", color: "#16a34a", perms: ["pos.sell"] },
    { href: "/sales", label: "المبيعات والورديات", icon: "reports", color: "#4f46e5", perms: ["pos.shift", "acc.view"] },
    { href: "/prices", label: "الأسعار", icon: "tag", color: "#059669", perms: ["prices.edit"] },
  ] },
  { id: "factory", title: "المصنع والمخزون", icon: "factory", color: "#dc2626", links: [
    { href: "/production", label: "أوامر الإنتاج", icon: "orders", color: "#b91c1c", perms: ["prod.orders"] },
    { href: "/station", label: "تابلت الغرف", icon: "factory", color: "#ea580c", perms: ["prod.orders"] },
    { href: "/pack", label: "محطة التغليف", icon: "box", color: "#dc2626", perms: ["prod.pack"] },
    { href: "/trips", label: "تحميل العربيات", icon: "truck", color: "#0891b2", perms: ["trips.load"] },
    { href: "/stock", label: "المخزون", icon: "stock", color: "#d97706", perms: ["stock.view"] },
    { href: "/transfers", label: "التحويلات", icon: "transfer", color: "#7c3aed", perms: ["stock.view", "stock.edit"] },
    { href: "/stock/dispose", label: "هالك وتبرعات", icon: "trash", color: "#dc2626", perms: ["stock.waste"] },
    { href: "/boxes", label: "تتبّع العلبة", icon: "search", color: "#0891b2", perms: ["stock.view"] },
  ] },
  { id: "purchasing", title: "المشتريات", icon: "purchase", color: "#7c3aed", links: [
    { href: "/purchasing", label: "أوامر التوريد والاستلام", icon: "purchase", color: "#7c3aed" },
    { href: "/purchasing/specs", label: "كارت الصنف", icon: "count", color: "#9333ea" },
    { href: "/purchasing/suppliers", label: "الموردين", icon: "partner", color: "#0d9488" },
    { href: "/overrides", label: "التجاوزات", icon: "shield", color: "#e11d48" },
  ] },
  { id: "accounts", title: "الحسابات", icon: "accounts", color: "#2563eb", links: [
    { href: "/accounts", label: "الملخص اليومي", icon: "reports", color: "#2563eb", perms: ["acc.view"] },
    { href: "/accounts/expenses", label: "المصروفات", icon: "wallet", color: "#1d4ed8", perms: ["acc.view", "acc.post", "acc.approve"] },
    { href: "/accounts/suppliers", label: "حسابات الموردين", icon: "partner", color: "#0f766e", perms: ["acc.view", "acc.pay"] },
  ] },
  { id: "items", title: "الأصناف", icon: "items", color: "#ca8a04", links: [
    { href: "/items", label: "الأصناف والعائلات", icon: "items", color: "#ca8a04", perms: ["items.edit"] },
    { href: "/items/import", label: "رفع وتنزيل إكسل", icon: "upload", color: "#65a30d", perms: ["items.edit"] },
  ] },
  { id: "hr", title: "الموظفين", icon: "hr", color: "#db2777", links: [
    { href: "/hr", label: "الحضور النهارده", icon: "finger", color: "#db2777", perms: ["hr.view", "hr.attendance"] },
    { href: "/hr/hours", label: "الساعات والأيام", icon: "clock", color: "#9333ea" },
    { href: "/hr/shifts", label: "الورديات والأذون", icon: "shifts", color: "#0891b2" },
    { href: "/hr/leaves", label: "الإجازات والسلف", icon: "calendar", color: "#16a34a", perms: ["hr.view", "hr.leaves"] },
    { href: "/hr/days", label: "أيام الإجازة والرسمية", icon: "star", color: "#f59e0b", perms: ["hr.view", "hr.days"] },
    { href: "/hr/payroll", label: "المرتبات", icon: "tag", color: "#059669", perms: ["hr.view", "hr.pay"] },
    { href: "/hr/appraisals", label: "تقييم الأداء", icon: "star", color: "#ea580c" },
    { href: "/hr/custody", label: "العهد", icon: "wallet", color: "#2563eb", perms: ["col.adv", "col.approve", "acc.view"] },
    { href: "/hr/requests", label: "الاعتراضات والأوراق", icon: "file", color: "#475569", perms: ["hr.pay", "hr.docs"] },
    { href: "/hr/messages", label: "رسايل الموظفين", icon: "mail", color: "#0ea5e9", perms: ["hr.messages"] },
    { href: "/hr/policy", label: "نص اللايحة", icon: "scroll", color: "#7c3aed", perms: ["hr.view", "settings.edit"] },
    { href: "/hr/rules", label: "اللايحة والأرصدة (الأرقام)", icon: "settings", color: "#525252", perms: ["settings.edit"] },
  ] },
  { id: "setup", title: "الإعداد", icon: "settings", color: "#525252", links: [
    { href: "/users", label: "الموظفين والصلاحيات", icon: "key", color: "#475569", perms: ["users.manage"] },
    { href: "/locations", label: "المواقع والفروع", icon: "pin", color: "#059669", perms: ["stock.edit", "settings.edit"] },
    { href: "/settings", label: "الإعدادات", icon: "settings", color: "#525252", perms: ["settings.edit"] },
  ] },
];

/** أطول رابط بيطابق الصفحة الحالية (أو صفحة القسم نفسه) */
export function activeLink(path: string, groups: NavGroup[]) {
  let best: { g: NavGroup; l: NavLink | null } | null = null;
  for (const g of groups) {
    if (path === `/sec/${g.id}`) return { g, l: null };
    for (const l of g.links)
      if ((path === l.href || path.startsWith(l.href + "/")) && (!best || !best.l || l.href.length > best.l.href.length)) best = { g, l };
  }
  return best;
}
