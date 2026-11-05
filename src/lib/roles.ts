/** قوالب جاهزة للصلاحيات — بتتدّي مرة واحدة وبعدين تتعدّل صلاحية صلاحية */
export const ROLES: { id: string; label: string; perms: string[] }[] = [
  { id: "cashier", label: "كاشير", perms: ["pos.sell", "stock.view"] },
  { id: "branch", label: "مسؤول فرع", perms: ["pos.sell", "stock.view", "stock.edit", "stock.adjust", "stock.waste", "stock.donate", "hr.view"] },
  { id: "packer", label: "عامل تغليف", perms: ["prod.pack"] },
  { id: "room", label: "عامل غرفة إنتاج", perms: ["prod.orders"] },
  { id: "loader", label: "تحميل وسواق", perms: ["trips.load", "stock.view"] },
  { id: "storekeeper", label: "أمين مخزن", perms: ["stock.view", "stock.edit", "stock.adjust", "stock.waste", "stock.donate", "purchase.edit"] },
  { id: "factory", label: "مدير مصنع", perms: ["prod.orders", "prod.pack", "trips.load", "stock.view", "stock.edit", "stock.adjust", "stock.waste", "items.edit", "override.recv"] },
  { id: "accountant", label: "محاسب", perms: ["acc.view", "acc.post", "hr.view", "stock.view"] },
];
