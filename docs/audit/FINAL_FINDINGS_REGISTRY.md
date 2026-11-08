# BAY RASLAN ERP — FINAL FINDINGS REGISTRY

**Date:** 2026-11-08
**Author:** Junie (JetBrains AI)
**Source Reports:** COMPLETE_SYSTEM_AUDIT.md, VALIDATION_REPORT.md, VALIDATION_SUMMARY.md
**Status:** Reconciled against actual source code

---

## Methodology

تم إنشاء سجل موحد (Canonical Registry) بكل المشاكل المكتشفة من التقارير السابقة.
كل مشكلة تم التحقق منها ضد الكود الفعلي مع أرقام الأسطر الدقيقة.
تم تصحيح الأخطاء في التقارير السابقة وإزالة التكرارات.

---

## Canonical Findings Registry

### BUG-001: Login Rate Limiting في الذاكرة فقط

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P1 (Security) |
| **Original IDs** | BUG-001, SEC-002 (duplicate) |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/lib/rate-limit.ts:7` |
| **Evidence** | السطر 7: `const attempts = new Map<string, { count: number; resetAt: number }>();` — Map في الذاكرة فقط. السطر 2-4 تعليق يؤكد: "مناسب للتطبيقات اللي مش بتشتغل على عدة instances. لو المشروع شغال على أكثر من instance، يفضل استخدام Redis." |
| **Analysis** | على Vercel (multi-instance)، كل instance عندها Map منفصلة. مهاجم يمكنه تجاوز الحد بالتبديل بين instances. Migration 0026 أضاف `hit_rate_limit()` للداتابيز لكن `login-action.ts` لسه بيستخدم `rate-limit.ts` في الذاكرة. |
| **Business Impact** | هجوم brute-force على تسجيل الدخول ممكن ينجح على Vercel. |
| **Security Impact** | عالي — Rate limiting غير فعال على الإنتاج. |
| **Implementation Layer** | Application code + Database |

---

### BUG-002: `recordFailedAttempt` يُستدعى قبل التحقق من المصادقة

| Field | Value |
|-------|-------|
| **Final Status** | ✅ PARTIALLY CONFIRMED |
| **Final Severity** | P3 (Downgraded from P2) |
| **Original IDs** | BUG-002 |
| **Duplicate of** | — |
| **Action Required** | نعم (تحسين) |
| **File** | `src/app/login/login-action.ts:21` |
| **Evidence** | السطر 21: `recordFailedAttempt(email)` يُستدعى قبل `signInWithPassword` في السطر 45. السطر 53: `clearRateLimit(email)` يُستدعى بعد النجاح. |
| **Analysis** | العداد بيزيد حتى لو الدخول نجح، لكن `clearRateLimit` بيمسح العداد بعد النجاح مباشرة. التأثير محدود — مش هيسبب lockout في الظروف العادية. |
| **Business Impact** | منخفض — العداد بيزيد مرة واحدة إضافية في حالة النجاح. |
| **Implementation Layer** | Application code |

---

### BUG-003: `getMe()` لا تحمي owner من إلغاء التنشيط

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | BUG-003 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/lib/perms.ts:17`, `src/app/(app)/users/staff.ts:51` |
| **Evidence** | perms.ts السطر 17: `if (prof && prof.active === false) return null;` — بتطبق على كل المستخدمين بما فيهم owner. staff.ts السطر 51: `if (id === me!.id) return;` — بتمنع إلغاء تنشيط نفسك فقط. |
| **Analysis** | مفيش حماية ضد admin يُلغي تنشيط owner. لو owner.active=false، getMe() بترجع null وowner هيتم تحويله لـ /login. |
| **Business Impact** | متوسط — ممكن admin يغلط ويُلغي تنشيط owner. |
| **Implementation Layer** | Application code + Database (RLS) |

---

### BUG-004: `pos_sale` لا تتحقق من `max_amount` للخصم

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P1 (Financial) |
| **Original IDs** | BUG-004 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `supabase/migrations/0015_pos.sql:103`, `supabase/migrations/0026_hardening.sql:89` |
| **Evidence** | السطر 103 في 0015: `if coalesce(p_discount, 0) > 0 and not has_perm('pos.discount')` — تحقق من الصلاحية فقط. دالة `perm_limit('pos.discount')` في 0019_accounts.sql:10-14 موجودة وتقرأ max_amount من grants، لكن pos_sale مش بتستخدمها. |
| **Correction Note** | تقرير VALIDATION_REPORT ذكر الدالة باسم `perm_max` — الاسم الصحيح هو `perm_limit` في 0019_accounts.sql:9-14. |
| **Analysis** | cashier عنده pos.discount يمكنه تطبيق خصم غير محدود. دالة `perm_limit` موجودة لكن pos_sale مش بتستخدمها للتحقق من max_amount. |
| **Business Impact** | عالي — cashier ممكن يطبق خصم كبير جداً. |
| **Security Impact** | مالي — سرقة عبر الخصم. |
| **Implementation Layer** | Database (SQL function) |

---

### BUG-005: `grant()` Server Action تسمح بالترقية الذاتية

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P1 (Security) |
| **Original IDs** | BUG-005, SEC-005 (duplicate) |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/app/(app)/users/actions.ts:6-22` |
| **Evidence** | السطر 6-8: `grant` تتحقق من `can(me, 'users.manage')` فقط. السطر 14-19: upsert على grants بدون التحقق من user_id. المستخدم يمكنه إضافة أي صلاحية لنفسه. |
| **Analysis** | المستخدم اللي عنده users.manage ممكن يضيف أي صلاحية لنفسه، بما فيهم users.manage لمستخدمين تانيين اللي ممكن يرفعوا أنفسهم. |
| **Business Impact** | عالي — privilege escalation. |
| **Security Impact** | عالي — أي مستخدم بـ users.manage ممكن يسيطر على النظام. |
| **Implementation Layer** | Application code + Database (RLS) |

---

### BUG-006: `revoke()` لا تحمي صلاحيات owner

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | BUG-006 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/app/(app)/users/actions.ts:24-30` |
| **Evidence** | السطر 24-29: revoke تتحقق من users.manage فقط، مش بتتحقق من إن المستخدم مش owner. |
| **Analysis** | owner عنده is_owner=true اللي بيبypass كل التحقق من الصلاحيات عبر is_owner() في الداتابيز. لكن revoke ممكن تحذف grants من سجل owner، وده مش واضح ومربك. |
| **Business Impact** | منخفض — owner لسه عنده كل الصلاحيات عبر is_owner. |
| **Implementation Layer** | Application code |

---

### BUG-007: `savePrice` لا تعيد تحميل الصفحة

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | BUG-007 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/app/(app)/prices/actions.ts` (17 lines) |
| **Evidence** | مفيش `revalidatePath()` في أي مكان في الملف. بعد upsert السعر، الكاش مش هيتم invalidation. |
| **Analysis** | السعر بيتحفظ في الداتابيز لكن الصفحة مش هتحديث حتى الكاش يexpire. |
| **Business Impact** | متوسط — الأسعار مش هتظهر فوراُ. |
| **Implementation Layer** | Application code |

---

### BUG-008: `addLocation` تستخدم `settings.edit` بينما RLS تستخدم `stock.edit`

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | BUG-008 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/app/(app)/locations/actions.ts:8`, `supabase/migrations/0001_foundation.sql:121` |
| **Evidence** | actions.ts السطر 8: `if (!can(me, "settings.edit"))` — تتحقق من settings.edit. 0001_foundation.sql السطر 121: `create policy loc_write on public.locations for all to authenticated using (has_perm('stock.edit'))` — RLS تتحقق من stock.edit. |
| **Analysis** | المستخدم بـ stock.edit ممكن يعدل locations عبر استدعاء مباشر للداتابيز لكن مش عبر UI. المستخدم بـ settings.edit ممكن يعدل عبر UI لكن RLS هترفض لو مفيش stock.edit. |
| **Business Impact** | متوسط — عدم اتساق في الصلاحيات. |
| **Implementation Layer** | Application code أو Database (RLS) |

---

### BUG-009: `toggleLocation` فيها race condition

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-009 |
| **Duplicate of** | — |
| **Action Required** | نعم (تحسين) |
| **File** | `src/app/(app)/locations/actions.ts:25-26` |
| **Evidence** | السطر 25: قراءة active. السطر 26: كتابة `!data?.active`. قراءه ثم كتابة في استعلامين منفصلين. |
| **Analysis** | لو مستخدمين اثنين toggle في نفس الوقت، واحد منهم هيضيع. |
| **Business Impact** | منخفض — حالة نادرة جداً. |
| **Implementation Layer** | Application code |

---

### BUG-010: `createStaff` تستخدم non-null assertion على `me!`

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-010 |
| **Duplicate of** | — |
| **Action Required** | نعم (تحسين) |
| **File** | `src/app/(app)/users/staff.ts:30` |
| **Evidence** | السطر 30: `granted_by: me!.id` — non-null assertion. |
| **Analysis** | مفيش تأثير runtime لأن can() بترجع false لو me null. لكن TypeScript strictness مش مثالية. |
| **Business Impact** | منخفض — مش هيسبب خطأ runtime. |
| **Implementation Layer** | Application code |

---

### BUG-011: `uploadPhoto` لا تتحقق من MIME type

| Field | Value |
|-------|-------|
| **Final Status** | ✅ PARTIALLY CONFIRMED |
| **Final Severity** | P3 (Downgraded from P2) |
| **Original IDs** | BUG-011, SEC-003 (duplicate) |
| **Duplicate of** | — |
| **Action Required** | نعم (تحسين) |
| **File** | `src/lib/img.ts` (25 lines) |
| **Evidence** | السطر 5: `export async function uploadPhoto(file: File, folder: string, max = 1400)` — مفيش تحقق MIME. لكن السطر 7: `const img = await new Promise<HTMLImageElement>(...)` — الكود بيحاول يحمل الملف كصورة. السطر 13: `c.toBlob((b) => res(b!), "image/jpeg", 0.75)` — أي ملف بيتحول لـ JPEG. |
| **Analysis** | الملفات غير الصور هتفشل في Image loading تلقائياً. لكن مفيش تحقق MIME صريح قبل المعالجة. |
| **Business Impact** | منخفض — الملفات غير الصور هتفشل تلقائياً. |
| **Implementation Layer** | Application code |

---

### BUG-012: No CSRF protection on Server Actions

| Field | Value |
|-------|-------|
| **Final Status** | ❌ FALSE POSITIVE |
| **Final Severity** | N/A |
| **Original IDs** | BUG-012 |
| **Duplicate of** | — |
| **Action Required** | لا |
| **File** | All `actions.ts` files |
| **Evidence** | Next.js Server Actions محمية بشكل افتراضي عبر Origin header verification و Same-site cookies. كل Server Actions بتتحقق من getMe() و can() اللي بتحتاج authenticated session. |
| **Analysis** | مفيش خطر CSRF حقيقي. |

---

### BUG-013: `dbMsg` تمسح نص مفيد قبل "ERROR:"

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-013 |
| **Duplicate of** | — |
| **Action Required** | لا (تحسين طفيف) |
| **File** | `src/lib/scan.ts:18` |
| **Evidence** | السطر 18: `export const dbMsg = (m: string | undefined) => (m || "حصل خطأ").replace(/^.*?ERROR:\s*/, "").trim();` |
| **Analysis** | regex بيمسح كل حاجة قبل ERROR: بما فيها نص مفيد. لكن في PostgreSQL، الأخطاء بتبدأ بـ "ERROR:" عادة، فالتأثير محدود. |
| **Business Impact** | منخفض — بعض رسائل الخطأ ممكن تفقد سياق. |
| **Implementation Layer** | Application code |

---

### BUG-014: `boxSn` regex يسمح بـ 3-9 digit numbers

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-014 |
| **Duplicate of** | — |
| **Action Required** | لا (تحسين طفيف) |
| **File** | `src/lib/scan.ts:4` |
| **Evidence** | السطر 4: `if (!/^R?\d{3,9}(\|.*)?$/i.test(v)) return null;` |
| **Analysis** | regex يسمح بـ 3-9 أرقام. التسلسل في الداتابيز يبدأ من 1201 (4 أرقام). 3 أرقام مش هتmatch أي علبة حقيقية. |
| **Business Impact** | منخفض — validation gap بسيط. |
| **Implementation Layer** | Application code |

---

### BUG-015: `cairoDayStart` قد ينتج timezone offset غير صحيح

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-015 |
| **Duplicate of** | — |
| **Action Required** | لا (تحسين طفيف) |
| **File** | `src/lib/time.ts:4-6` |
| **Evidence** | السطر 4: `const off = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";` |
| **Analysis** | Intl.DateTimeFormat بيستخدم التوقيت الصحيح تلقائياً بما فيهم DST. لكن تحليل offset من string ممكن يفشل لو تنسيق الإخراج يتغير. |
| **Business Impact** | منخفض — احتمال ضئيل جداً. |
| **Implementation Layer** | Application code |

---

### BUG-016: `MODULES` و `BRANCH_APPS` فيها تكرار

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-016 |
| **Duplicate of** | — |
| **Action Required** | لا (تحسين صيانة) |
| **File** | `src/lib/apps.ts` |
| **Evidence** | MODULES والسطر 4-26 و BRANCH_APPS والسطر 29-42 فيهم تكرار: pos, orders, stock, prices, trips, acc. |
| **Analysis** | نفس التطبيقات موجودة في القوائم الاتنين بخصائص مختلفة قليلاً. ده بيوزع عبء الصيانة. |
| **Business Impact** | منخفض — صيانة فقط. |
| **Implementation Layer** | Application code |

---

### BUG-017: مفيش error boundary في app layout

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | BUG-017 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/app/(app)/layout.tsx` |
| **Evidence** | مفيش `error.tsx` في أي مكان في المشروع. |
| **Analysis** | لو component ألقى خطأ أثناء rendering، التطبيق هيظهر صفحة بيضاء. |
| **Business Impact** | متوسط — تجربة مستخدم سيئة عند الأخطاء. |
| **Implementation Layer** | Application code |

---

### BUG-018: `getMe()` لا تخزن النتائج في cache

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P3 (Maintained) |
| **Original IDs** | BUG-018 |
| **Duplicate of** | — |
| **Action Required** | لا (تحسين أداء) |
| **File** | `src/lib/perms.ts` |
| **Evidence** | كل استدعاء لـ getMe() بيعمل استعلامين: profiles + grants. في صفحة واحدة ممكن يتستدعى عدة مرات. |
| **Analysis** | AppLayout بيستدعي getMe() مرة واحدة. لكن كل page.tsx ممكن تستدعي getMe() مرة تانية. |
| **Business Impact** | منخفض — overhead بسيط. |
| **Implementation Layer** | Application code |

---

### SEC-001: مفيش Content Security Policy

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | SEC-001 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `src/middleware.ts` (26 lines) |
| **Evidence** | middleware.ts يطبق X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS. لكن مفيش Content-Security-Policy. |
| **Analysis** | React يقوم بـ escaping افتراضياً، لكن CSP بيوفر طبقة حماية إضافية. |
| **Implementation Layer** | Application code (middleware) |

---

### SEC-004: Audit Trail ناقص على بعض الجداول

| Field | Value |
|-------|-------|
| **Final Status** | ✅ PARTIALLY CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | SEC-004 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `supabase/migrations/0001_foundation.sql:98-100`, `0002_catalog.sql:68`, `0006_item_specs_suppliers.sql:58`, `0008_overrides.sql:48`, `0019_accounts.sql:132-133` |
| **Evidence** | audit_log triggers موجودين على: grants, locations, settings, items, item_specs, override_requests, expenses, supplier_payments. لكن مش موجودين على: sales/sale_lines, stock_moves, transfers/transfer_boxes, boxes, prod_orders/prod_steps. |
| **Analysis** | Audit trail موجود جزئياً على 8 جداول. ناقص على 5 مجموعات جداول حرجة. |
| **Business Impact** | متوسط — مفيش سجل للعمليات المالية والمخزنية الحرجة. |
| **Implementation Layer** | Database (SQL triggers) |

---

### DB-001: Missing index on grants(user_id, perm)

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | DB-001 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `supabase/migrations/0001_foundation.sql:33-39` |
| **Evidence** | جدول grants مفيش عليه index على (user_id, perm). has_perm() في السطر 50-52 بتستعلم grants في كل عملية. |
| **Analysis** | has_perm() بتستدعى في كل Server Action وكل database function. بدون index، كل استعلام بيScan الجدول بالكامل. |
| **Query Benefit** | `select 1 from grants g where g.user_id = auth.uid() and g.perm = p` — استعلام بيتعمل في كل عملية. |
| **Write Cost** | ضئيل — جدول صغير (صلاحيات الموظفين). |
| **Implementation Layer** | Database (SQL index) |

---

### DB-002: Missing index on prices(item_id, location_id, channel)

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | DB-002 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `supabase/migrations/0002_catalog.sql:36-42` |
| **Evidence** | جدول prices مفيش عليه index على (item_id, location_id, channel). pos_price() في 0015_pos.sql السطر 48-51 بتستعلم prices في كل عملية بيع. |
| **Analysis** | pos_price() بتستدعى في كل عملية بيع POS وكل عملية order. بدون index، كل استعلام بيScan الجدول بالكامل. |
| **Query Benefit** | `select price from prices where item_id = p_item and location_id = p_loc and channel = 'direct'` — استعلام بيتعمل في كل عملية بيع. |
| **Write Cost** | ضئيل — جدول متوسط الحجم. |
| **Implementation Layer** | Database (SQL index) |

---

### DB-003: Missing index on stock_moves(kind, at)

| Field | Value |
|-------|-------|
| **Final Status** | ✅ PARTIALLY ADDRESSED |
| **Final Severity** | P3 (Downgraded) |
| **Original IDs** | DB-003 |
| **Duplicate of** | — |
| **Action Required** | نعم (index إضافي) |
| **File** | `supabase/migrations/0026_hardening.sql:173` |
| **Evidence** | 0026 أضاف `idx_stock_moves_at on stock_moves(at)` لكن مفيش index على (kind, at) معاً. |
| **Analysis** | daily_summary view و accounts page بتستعلم stock_moves بفلترة على kind و at معاً. index على at فقط مش كافي للاستعلامات اللي بتفلتر على kind. |
| **Query Benefit** | `select ... from stock_moves where kind = 'sale' and at >= ...` — استعلام بيتعمل في daily_summary. |
| **Write Cost** | متوسط — جدول كبير الحجم (كل حركة مخزن). |
| **Implementation Layer** | Database (SQL index) |

---

### DB-004: No check constraint on grants.max_amount >= 0

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | DB-004 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `supabase/migrations/0001_foundation.sql:37` |
| **Evidence** | `max_amount numeric` — مفيش check constraint. |
| **Analysis** | ممكن حد يحط max_amount سالب وده هيسبب سلوك غير متوقع في perm_limit(). |
| **Implementation Layer** | Database (SQL constraint) |

---

### DB-005: No check constraint on grants.until

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | DB-005 |
| **Duplicate of** | — |
| **Action Required** | نعم |
| **File** | `supabase/migrations/0001_foundation.sql:36` |
| **Evidence** | `until date` — مفيش check constraint. |
| **Analysis** | ممكن حد يحط until في الماضي وده هيسبب صلاحية منتهية فوراُ. لكن `has_perm()` بتتحقق من `g.until >= current_date` في السطر 52، فالتأثير محدود — الصلاحية هتبقى غير فعالة. |
| **Correction** | has_perm() بتستبعد grants المنتهية تلقائياً (السطر 52: `g.until is null or g.until >= current_date`). فالتأثير أقل من المتوقع. لكن check constraint بيمنع إدخال بيانات غير منطقية من الأساس. |
| **Implementation Layer** | Database (SQL constraint) |

---

### DB-006: Some FKs missing explicit ON DELETE behavior

| Field | Value |
|-------|-------|
| **Final Status** | ✅ ADDRESSED BY 0026 |
| **Final Severity** | N/A |
| **Original IDs** | DB-006 |
| **Duplicate of** | — |
| **Action Required** | لا |
| **File** | `supabase/migrations/0026_hardening.sql:123-168` |
| **Evidence** | 0026 أضاف ON DELETE behavior للـ FKs الحرجة: boxes.item_id → restrict, stock_moves.item_id → restrict, stock_moves.location_id → restrict, stock_moves.box_sn → set null, transfer_boxes.box_sn → restrict. |
| **Analysis** | المشكلة تم معالجتها في 0026. |

---

### GAP-001: No weight reconciliation between production and packaging

| Field | Value |
|-------|-------|
| **Final Status** | ✅ PARTIALLY CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | GAP-001 |
| **Duplicate of** | — |
| **Action Required** | نعم (تحليل أعمال) |
| **File** | `supabase/migrations/0016_production.sql:100`, `supabase/migrations/0017_pack_order.sql:46-48` |
| **Evidence** | prod_finish في 0016 بتتحقق من `p_out + p_waste <= in_weight * 1.05` (5% tolerance). prod_pack_finish في 0017 بتتحقق من التغليف. لكن مفيش تحقق إن إجمالي الوزن المغلف يساوي إنتاج الخطوة السابقة. |
| **Analysis** | الإنتاج يسجل output weight. التغليف يخلق boxes بأوزان فردية. prod_pack_finish بتحسب `sum(weight)` من boxes وتضعها كـ out_weight. مفيش تحقق صريح إن مجموع أوزان boxes = output weight من الخطوة السابقة. لكن النظام بيستخدم نفس prod_order للربط، فأي فرق هيكون واضح في التقارير. |
| **Business Impact** | متوسط — ممكن يكون فيه فرق بين الإنتاج والتغليف لكن النظام مش بيرفضه. |
| **Implementation Layer** | Database (SQL function) أو Business process |

---

### GAP-002: Trip receiving at destination not explicitly tracked

| Field | Value |
|-------|-------|
| **Final Status** | ✅ CONFIRMED |
| **Final Severity** | P2 (Maintained) |
| **Original IDs** | GAP-002 |
| **Duplicate of** | — |
| **Action Required** | نعم (تحليل أعمال) |
| **File** | `supabase/migrations/0013_trips.sql:98-115` |
| **Evidence** | trip_depart يقوم بـ transfers (السطر 108). الاستلام بيتعمل عبر receive_transfer العادية. مفيش تتبع خاص بوصول الرحلة. |
| **Analysis** | transfers اللي بتنتج من trip_depart بتتستلم عبر نفس workflow التحويلات العادية. مفيش ربط صريح بين استلام التحويل ووصول الرحلة. لكن transfers مرتبطة بـ trip_id (السطر 38: `alter table public.transfers add column if not exists trip_id bigint references public.trips`). |
| **Business Impact** | متوسط — صعب تتبع حالة الرحلة بعد الوصول بدون فحص transfers المرتبطة. |
| **Implementation Layer** | Database (SQL view) أو Application code |

---

### GAP-003: No automatic supplier ledger view

| Field | Value |
|-------|-------|
| **Final Status** | ❌ FALSE POSITIVE |
| **Final Severity** | N/A |
| **Original IDs** | GAP-003 |
| **Duplicate of** | — |
| **Action Required** | لا |
| **File** | `supabase/migrations/0019_accounts.sql:96-108` |
| **Evidence** | `supplier_ledger` view موجود (السطر 96-101). `supplier_balances` view موجود (السطر 103-108). |
| **Analysis** | المشكلة غير موجودة — views موجودة وتعمل بشكل صحيح. |

---

## Deduplication Summary

| Original ID | Duplicate ID | Relationship |
|-------------|--------------|--------------|
| BUG-001 | SEC-002 | نفس المشكلة: Rate limiting في الذاكرة |
| BUG-011 | SEC-003 | نفس المشكلة: File upload validation |
| BUG-005 | SEC-005 | نفس المشكلة: Self-permission elevation |

---

## Final Count Calculation

### By Status

| Status | Count | IDs |
|--------|-------|-----|
| **CONFIRMED** | 18 | BUG-001, BUG-003, BUG-004, BUG-005, BUG-006, BUG-007, BUG-008, BUG-009, BUG-010, BUG-013, BUG-014, BUG-015, BUG-016, BUG-017, BUG-018, DB-001, DB-002, DB-004 |
| **PARTIALLY CONFIRMED** | 4 | BUG-002, BUG-011, SEC-004, GAP-001 |
| **PARTIALLY ADDRESSED** | 1 | DB-003 |
| **ADDRESSED BY 0026** | 1 | DB-006 |
| **FALSE POSITIVE** | 2 | BUG-012, GAP-003 |
| **DUPLICATE** | 3 | SEC-002, SEC-003, SEC-005 |
| **Total Original Findings** | **29** | |

### Unique Actionable Findings

| Category | Count |
|----------|-------|
| **Confirmed (need action)** | 18 |
| **Partially confirmed (need action)** | 4 |
| **Partially addressed (need action)** | 1 |
| **Total unique actionable** | **23** |

### By Severity (Unique Actionable Only)

| Severity | Count | IDs |
|----------|-------|-----|
| **P1 (High)** | 3 | BUG-001, BUG-004, BUG-005 |
| **P2 (Medium)** | 10 | BUG-003, BUG-006, BUG-007, BUG-008, BUG-017, SEC-001, SEC-004, DB-001, DB-002, DB-004 |
| **P3 (Low)** | 10 | BUG-002, BUG-009, BUG-010, BUG-011, BUG-013, BUG-014, BUG-015, BUG-016, BUG-018, DB-003 |
| **P2 (Gap)** | 2 | GAP-001, GAP-002 |
| **Total** | **25** | |

### By Implementation Layer

| Layer | Count |
|-------|-------|
| **Application code only** | 12 |
| **Database (SQL) only** | 5 |
| **Application + Database** | 3 |
| **Business process analysis** | 2 |
| **No action needed** | 3 |

---

## Corrections from Previous Reports

### Validation Report Errors Found

| Error | Description |
|-------|-------------|
| **perm_max vs perm_limit** | VALIDATION_REPORT ذكر الدالة باسم `perm_max` في 0019_accounts.sql:10-14. الاسم الصحيح هو `perm_limit`. |
| **DB-002 severity** | VALIDATION_SUMMARY ذكر DB-002 كـ P2 في التوزيع النهائي لكن مفيش DB-002 في قائمة P2. DB-002 هو index على prices — تم تأكيده كـ P2. |
| **BUG-003 severity inconsistency** | VALIDATION_SUMMARY ذكر BUG-003 كـ P1 في قائمة P1 (owner protection). VALIDATION_REPORT ذكره كـ P2. تم تصحيحه لـ P2 — التأثير متوسط لأن admin محتاج users.manage عشان يغلط. |
| **DB-005 impact** | has_perm() بتستبعد grants المنتهية تلقائياً (until >= current_date). فالتأثير أقل من المتوقع — الصلاحية هتبقى غير فعالة لكن مفيش خطأ. |

---

*Final registry generated by Junie (JetBrains AI) on 2026-11-08*
*Based on evidence-based reconciliation of all three audit reports against actual source code*
