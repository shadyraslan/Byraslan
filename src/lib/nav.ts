// [groupLabel, [[linkLabel, href, iconKey, hasSubmenu?], ...]]
export type NavItem = [string, string, string, boolean?];
export type NavGroup = [string, NavItem[]];

export const NAV_GROUPS: NavGroup[] = [
  ["", [
    ["الرئيسية",                    "/dashboard",              "home",        false],
    ["الإحصائيات",                  "/statistics",             "barchart",    false],
  ]],
  ["البيع", [
    ["طلبات الأونلاين",             "/orders",                 "cart",        true],
    ["الكاشير",                     "/pos",                    "pos",         true],
    ["المبيعات والورديات",           "/sales",                  "invoice",     true],
    ["أسعار الفروع",                "/prices",                 "card",        true],
  ]],
  ["المصنع والمخزون", [
    ["أوامر الإنتاج",               "/production",             "gear",        true],
    ["تابلت الغرف",                 "/station",                "layers",      true],
    ["محطة التغليف",                "/pack",                   "cost",        true],
    ["تحميل العربيات",              "/trips",                  "truck",       true],
    ["المخزون",                     "/stock",                  "box",         true],
    ["التحويلات",                   "/transfers",              "barchart",    true],
    ["هالك وتبرعات",                "/stock/dispose",          "invoice",     true],
    ["تتبّع العلبة",                 "/boxes",                  "database",    true],
  ]],
  ["المشتريات", [
    ["أوامر التوريد والاستلام",      "/purchasing",             "cart",        true],
    ["كارت الصنف",                  "/purchasing/specs",       "invoice",     true],
    ["الموردين",                    "/purchasing/suppliers",   "branch",      true],
    ["التجاوزات",                   "/overrides",              "settingsgear",true],
  ]],
  ["الحسابات", [
    ["الملخص اليومي",               "/accounts",               "card",        true],
    ["المصروفات",                   "/accounts/expenses",      "cost",        true],
    ["حسابات الموردين",             "/accounts/suppliers",     "database",    true],
  ]],
  ["الأصناف", [
    ["الأصناف والعائلات",           "/items",                  "invoice",     true],
  ]],
  ["الإعداد", [
    ["المواقع",                     "/locations",              "branch",      true],
    ["المستخدمين والصلاحيات",       "/users",                  "layers",      true],
    ["الإعدادات",                   "/settings",               "settingsgear",false],
  ]],
];

// Flat list for search
export const NAV_FLAT = NAV_GROUPS.flatMap(([, items]) =>
  items.map(([label, href]) => ({ label, href }))
);
