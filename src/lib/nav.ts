/** قايمة السيستم: كل شاشة في مكانها، وكل رابط بالصلاحيات اللي تفتحه (فاضي = أي موظف). المالك بيشوف كله. */
export type NavLink = { href: string; label: string; icon: string; perms?: string[] };
export type NavGroup = { title: string; icon: string; links: NavLink[] };

export const NAV: NavGroup[] = [
  { title: "الطلبات والعملاء", icon: "🛒", links: [
    { href: "/orders", label: "طلبات الأونلاين", icon: "📦", perms: ["orders.handle"] },
    { href: "/bookings", label: "الحجوزات والتقارير", icon: "📅", perms: ["orders.handle", "orders.booking", "cs.agent"] },
    { href: "/cs", label: "خدمة العملاء", icon: "💬", perms: ["cs.agent", "cs.manage"] },
    { href: "/cs/new", label: "طلب أو حجز واتساب / تليفون", icon: "☎️", perms: ["cs.agent", "orders.handle"] },
    { href: "/complaints", label: "الشكاوى والتعويضات", icon: "⚠️", perms: ["orders.handle", "cs.agent"] },
    { href: "/zones", label: "مناطق التوصيل", icon: "🗺️", perms: ["settings.edit"] },
    { href: "/notify", label: "إشعارات ورسايل العملاء", icon: "🔔", perms: ["notify.send"] },
  ] },
  { title: "الفروع والكاشير", icon: "🏪", links: [
    { href: "/cashier", label: "الكاشير", icon: "🧾", perms: ["pos.sell"] },
    { href: "/sales", label: "المبيعات والورديات", icon: "📊", perms: ["pos.shift", "acc.view"] },
    { href: "/prices", label: "الأسعار", icon: "🏷️", perms: ["prices.edit"] },
  ] },
  { title: "المصنع والمخزون", icon: "🏭", links: [
    { href: "/production", label: "أوامر الإنتاج", icon: "🗂️", perms: ["prod.orders"] },
    { href: "/station", label: "تابلت الغرف", icon: "📟", perms: ["prod.orders"] },
    { href: "/pack", label: "محطة التغليف", icon: "📦", perms: ["prod.pack"] },
    { href: "/trips", label: "تحميل العربيات", icon: "🚚", perms: ["trips.load"] },
    { href: "/stock", label: "المخزون", icon: "📚", perms: ["stock.view"] },
    { href: "/transfers", label: "التحويلات", icon: "🔁", perms: ["stock.view", "stock.edit"] },
    { href: "/stock/dispose", label: "هالك وتبرعات", icon: "♻️", perms: ["stock.waste"] },
    { href: "/boxes", label: "تتبّع العلبة", icon: "🔎", perms: ["stock.view"] },
  ] },
  { title: "المشتريات", icon: "🧺", links: [
    { href: "/purchasing", label: "أوامر التوريد والاستلام", icon: "📥" },
    { href: "/purchasing/specs", label: "كارت الصنف", icon: "📋" },
    { href: "/purchasing/suppliers", label: "الموردين", icon: "🤝" },
    { href: "/overrides", label: "التجاوزات", icon: "⛔" },
  ] },
  { title: "الحسابات", icon: "💰", links: [
    { href: "/accounts", label: "الملخص اليومي", icon: "📈", perms: ["acc.view"] },
    { href: "/accounts/expenses", label: "المصروفات", icon: "💸", perms: ["acc.view", "acc.post", "acc.approve"] },
    { href: "/accounts/suppliers", label: "حسابات الموردين", icon: "📒", perms: ["acc.view", "acc.pay"] },
  ] },
  { title: "الأصناف", icon: "🥩", links: [
    { href: "/items", label: "الأصناف والعائلات", icon: "🗃️", perms: ["items.edit"] },
    { href: "/items/import", label: "رفع وتنزيل إكسل", icon: "📤", perms: ["items.edit"] },
  ] },
  { title: "الموظفين", icon: "👥", links: [
    { href: "/hr", label: "الحضور النهارده", icon: "🟢", perms: ["hr.view", "hr.attendance"] },
    { href: "/hr/hours", label: "الساعات والأيام", icon: "⏱️" },
    { href: "/hr/shifts", label: "الورديات والأذون", icon: "🗓️" },
    { href: "/hr/leaves", label: "الإجازات والسلف", icon: "🏖️", perms: ["hr.view", "hr.leaves"] },
    { href: "/hr/days", label: "أيام الإجازة والرسمية", icon: "🎉", perms: ["hr.view", "hr.days"] },
    { href: "/hr/payroll", label: "المرتبات", icon: "💵", perms: ["hr.view", "hr.pay"] },
    { href: "/hr/appraisals", label: "تقييم الأداء", icon: "⭐" },
    { href: "/hr/custody", label: "العهد", icon: "👜", perms: ["col.adv", "col.approve", "acc.view"] },
    { href: "/hr/requests", label: "الاعتراضات والأوراق", icon: "📄", perms: ["hr.pay", "hr.docs"] },
    { href: "/hr/messages", label: "رسايل الموظفين", icon: "✉️", perms: ["hr.messages"] },
    { href: "/hr/policy", label: "نص اللايحة", icon: "📜", perms: ["hr.view", "settings.edit"] },
    { href: "/hr/rules", label: "اللايحة والأرصدة (الأرقام)", icon: "⚙️", perms: ["settings.edit"] },
  ] },
  { title: "الإعداد", icon: "⚙️", links: [
    { href: "/users", label: "الموظفين والصلاحيات", icon: "🔐", perms: ["users.manage"] },
    { href: "/locations", label: "المواقع والفروع", icon: "📍", perms: ["stock.edit", "settings.edit"] },
    { href: "/settings", label: "الإعدادات", icon: "🛠️", perms: ["settings.edit"] },
  ] },
];

/** أطول رابط بيطابق الصفحة الحالية */
export function activeLink(path: string, groups: NavGroup[]) {
  let best: { g: NavGroup; l: NavLink } | null = null;
  for (const g of groups) for (const l of g.links)
    if ((path === l.href || path.startsWith(l.href + "/")) && (!best || l.href.length > best.l.href.length)) best = { g, l };
  return best;
}
