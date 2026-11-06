/** أيقونات الرئيسية والفروع. href = null يعني لسه بيتبني (بيوديك لصفحة "قريبًا") */
export type App = { id: string; label: string; icon: string; color: string; href: string | null; perm?: string };

export const MODULES: App[] = [
  { id: "sales", label: "الكاشير", icon: "pos", color: "#16a34a", href: "/cashier", perm: "pos.sell" },
  { id: "orders", label: "طلبات الأونلاين", icon: "app", color: "#0ea5e9", href: "/orders", perm: "orders.handle" },
  { id: "purchase", label: "المشتريات والاستلام", icon: "purchase", color: "#7c3aed", href: "/purchasing" },
  { id: "specs", label: "كارت الصنف", icon: "items", color: "#9333ea", href: "/purchasing/specs" },
  { id: "overrides", label: "التجاوزات", icon: "shield", color: "#e11d48", href: "/overrides" },
  { id: "stock", label: "المخزون", icon: "stock", color: "#d97706", href: "/stock", perm: "stock.view" },
  { id: "production", label: "أوامر الإنتاج", icon: "orders", color: "#b91c1c", href: "/production", perm: "prod.orders" },
  { id: "station", label: "تابلت الغرف", icon: "factory", color: "#ea580c", href: "/station", perm: "prod.orders" },
  { id: "factory", label: "محطة التغليف", icon: "factory", color: "#dc2626", href: "/pack", perm: "prod.pack" },
  { id: "boxes", label: "تتبّع العلبة", icon: "box", color: "#0891b2", href: "/boxes", perm: "stock.view" },
  { id: "transfers", label: "التحويلات بالمسح", icon: "transfer", color: "#7c3aed", href: "/transfers", perm: "stock.view" },
  { id: "trips", label: "تحميل العربيات", icon: "truck", color: "#0891b2", href: "/trips", perm: "trips.load" },
  { id: "items", label: "الأصناف", icon: "items", color: "#ca8a04", href: "/items" },
  { id: "prices", label: "أسعار الفروع", icon: "tag", color: "#059669", href: "/prices", perm: "prices.edit" },
  { id: "acc", label: "الحسابات", icon: "accounts", color: "#2563eb", href: "/accounts", perm: "acc.view" },
  { id: "expenses", label: "المصروفات", icon: "accounts", color: "#1d4ed8", href: "/accounts/expenses", perm: "acc.post" },
  { id: "hr", label: "الموارد البشرية", icon: "hr", color: "#db2777", href: "/hr", perm: "hr.view" },
  { id: "reports", label: "المبيعات والورديات", icon: "reports", color: "#4f46e5", href: "/sales", perm: "acc.view" },
  { id: "locations", label: "المواقع والفروع", icon: "pin", color: "#059669", href: "/locations" },
  { id: "users", label: "المستخدمين والصلاحيات", icon: "shield", color: "#475569", href: "/users", perm: "users.manage" },
  { id: "settings", label: "الإعدادات", icon: "settings", color: "#525252", href: "/settings", perm: "settings.edit" },
];

/** أيقونات جوه كل فرع */
export const BRANCH_APPS: App[] = [
  { id: "pos", label: "الكاشير", icon: "pos", color: "#16a34a", href: "/cashier", perm: "pos.sell" },
  { id: "orders", label: "طلبات الأونلاين", icon: "orders", color: "#0ea5e9", href: "/orders", perm: "orders.handle" },
  { id: "stock", label: "مخزون الفرع", icon: "stock", color: "#d97706", href: "/stock", perm: "stock.view" },
  { id: "receive", label: "استلام العربية", icon: "truck", color: "#0891b2", href: "/transfers" },
  { id: "transfer", label: "التحويلات", icon: "transfer", color: "#7c3aed", href: "/transfers", perm: "stock.edit" },
  { id: "count", label: "الجرد", icon: "count", color: "#ca8a04", href: null, perm: "stock.adjust" },
  { id: "waste", label: "الهالك والتبرعات", icon: "trash", color: "#dc2626", href: "/stock/dispose", perm: "stock.waste" },
  { id: "prices", label: "أسعار الفرع", icon: "tag", color: "#059669", href: "/prices", perm: "prices.edit" },
  { id: "partner", label: "الماركت الشريك", icon: "partner", color: "#0d9488", href: null },
  { id: "staff", label: "موظفين الفرع", icon: "hr", color: "#db2777", href: "/hr", perm: "hr.view" },
  { id: "cash", label: "مصروفات الفرع", icon: "accounts", color: "#2563eb", href: "/accounts/expenses", perm: "acc.post" },
  { id: "reports", label: "تقارير الفرع", icon: "reports", color: "#4f46e5", href: null },
];

export const LOC_ICON: Record<string, string> = {
  factory: "factory", section: "box", warehouse: "stock", sub: "stock", dark: "store", shop: "store", partner: "partner", donation: "heart",
};
export const LOC_TYPE: Record<string, string> = {
  factory: "مصنع", section: "قسم مصنع", warehouse: "مخزن", sub: "مخزن فرعي", dark: "دارك ستور", shop: "فرع بيع مباشر", partner: "مخزن شريك", donation: "تبرعات",
};
