/** قوالب جاهزة للصلاحيات — بتتدّي مرة واحدة وبعدين تتعدّل صلاحية صلاحية */
export const ROLES: { id: string; label: string; perms: string[] }[] = [
  { id: "cashier", label: "كاشير", perms: ["pos.sell", "stock.view"] },
  { id: "branch", label: "مسؤول فرع", perms: ["orders.handle", "orders.cancel", "acc.post", "pos.sell", "stock.view", "stock.edit", "stock.adjust", "stock.waste", "stock.donate", "hr.view", "hr.attendance", "hr.leaves"] },
  { id: "packer", label: "عامل تغليف", perms: ["prod.pack"] },
  { id: "room", label: "عامل غرفة إنتاج", perms: ["prod.orders"] },
  { id: "online", label: "تحضير طلبات أونلاين", perms: ["orders.handle", "stock.view"] },
  { id: "loader", label: "تحميل وسواق", perms: ["trips.load", "stock.view"] },
  { id: "storekeeper", label: "أمين مخزن", perms: ["stock.view", "stock.edit", "stock.adjust", "stock.waste", "stock.donate", "purchase.edit"] },
  { id: "factory", label: "مدير مصنع", perms: ["prod.orders", "prod.pack", "trips.load", "stock.view", "stock.edit", "stock.adjust", "stock.waste", "items.edit", "override.recv"] },
  { id: "accountant", label: "محاسب", perms: ["acc.view", "acc.post", "acc.pay", "hr.view", "stock.view"] },
];
