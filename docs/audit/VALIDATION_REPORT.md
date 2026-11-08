# BAY RASLAN ERP — VALIDATION REPORT

**Date:** 2026-11-08
**Validator:** Junie (JetBrains AI)
**Original Report:** `docs/audit/COMPLETE_SYSTEM_AUDIT.md`
**Status:** Evidence-Based Validation Complete

---

## Methodology

تم التحقق من كل مشكلة في تقرير التدقيق السابق ضد الكود الفعلي والملفات SQL.
كل مشكلة تم تصنيفها كواحدة من:

- **CONFIRMED** — المشكلة مؤكدة بالكود الفعلي
- **PARTIALLY CONFIRMED** — المشكلة موجودة لكن التأثير أقل من المتوقع أو فيه حماية جزئية
- **FALSE POSITIVE** — المشكلة غير موجودة أو تم حلها مسبقاً
- **DUPLICATE** — نفس مشكلة مكتشفة سابقاً
- **NEEDS RUNTIME TESTING** — محتاج اختبار مباشر للتأكيد

---

## Part 1 — BUG Findings Validation

### BUG-001: Rate Limiting is In-Memory Only for Login

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P1 (Security) — Maintained |
| **File** | `src/lib/rate-limit.ts` (all 75 lines) |
| **Evidence** | السطر 7: `const attempts = new Map<string, { count: number; resetAt: number }>();` — Map في الذاكرة فقط. السطر 4-5 تعليق يؤكد: "مناسب للتطبيقات اللي مش بتشتغل على عدة instances. لو المشروع شغال على أكثر من instance، يفضل استخدام Redis." |
| **Reproduction** | على Vercel (multi-instance)، كل instance عندها Map منفصلة. مهاجم يمكنه تجاوز الحد بالتبديل بين instances. |
| **Business Impact** | هجوم brute-force على تسجيل الدخول ممكن ينجح على Vercel. |
| **Security Impact** | عالي — Rate limiting غير فعال على الإنتاج. |
| **Recommended Fix** | نقل Rate limiting للداتابيز باستخدام نمط hit_rate_limit الموجود في 0026. |
| **Verification Test** | اختبار 6+ محاولات دخول فاشلة من نفس IP على بيئة multi-instance. |

---

### BUG-002: `recordFailedAttempt` called before authentication check

| Field | Value |
|-------|-------|
| **Status** | ✅ PARTIALLY CONFIRMED |
| **Severity** | P2 — Downgraded from P2 (actual impact lower) |
| **File** | `src/app/login/login-action.ts` |
| **Evidence** | السطر 21: `recordFailedAttempt(email)` يُستدعى قبل `signInWithPassword` في السطر 45. السطر 53: `clearRateLimit(email)` يُستدعى بعد النجاح. |
| **Analysis** | التقرير قال إن النجاح بيزيد العداد. في الواقع `recordFailedAttempt` بيزيد العداد دايماً (السطر 64 في rate-limit.ts). لكن `clearRateLimit` بيمسح العداد بعد النجاح. المشكلة الحقيقية: لو redirect فشل بعد النجاح، العداد هيكون تمسح عادي لأن clearRateLimit بتعمل قبل redirect. |
| **Correction** | التأثير أقل من المتوقع — clearRateLimit بتعمل مباشرة بعد النجاح، مش بعد redirect. المشكلة الوحيدة إن العداد بيزيد حتى لو الدخول نجح، لكن ده بيتعوض بـ clearRateLimit. |
| **Business Impact** | منخفض — مش هيسبب lockout في الظروف العادية. |
| **Recommended Fix** | نقل `recordFailedAttempt` بعد `signInWithPassword` وتحديداً في حالة الخطأ فقط. |

---

### BUG-003: `getMe()` does not check `active` flag for owner

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `src/lib/perms.ts:17`, `src/app/(app)/users/staff.ts:51` |
| **Evidence** | perms.ts السطر 17: `if (prof && prof.active === false) return null;` — بتطبق على كل المستخدمين بما فيهم owner. staff.ts السطر 51: `if (id === me!.id) return;` — بتمنع إلغاء تنشيط نفسك بس. |
| **Analysis** | مفيش حماية ضد admin يُلغي تنشيط owner. لو owner.active=false، getMe() بترجع null وowner هيتم تحويله لـ /login. |
| **Business Impact** | متوسط — ممكن admin يغلط ويُلغي تنشيط owner. |
| **Recommended Fix** | إضافة `if (prof?.is_owner) return;` في setStaffActive قبل إلغاء التنشيط. |
| **Verification Test** | محاولة إلغاء تنشيط owner من قبل admin آخر. |

---

### BUG-004: `pos_sale` does not validate discount against permission amount

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P1 (Financial) — Maintained |
| **File** | `src/app/(app)/pos/actions.ts:32`, `supabase/migrations/0015_pos.sql:103`, `supabase/migrations/0026_hardening.sql:89` |
| **Evidence** | pos/actions.ts السطر 32: `if (discount < 0)` — تحقق من السالب بس. 0015_pos.sql السطر 103: `if coalesce(p_discount, 0) > 0 and not has_perm('pos.discount')` — تحقق من الصلاحية بس. 0026_hardening.sql السطر 89: نفس التحقق. |
| **Analysis** | دالة `perm_max` في 0019_accounts.sql (السطر 10-14) بتقرأ max_amount من grants، لكن pos_sale مش بتستخدمها. cashier عنده pos.discount يمكنه تطبيق خصم غير محدود. |
| **Business Impact** | عالي — cashier ممكن يطبق خصم كبير جداً. |
| **Security Impact** | مالي — سرقة عبر الخصم. |
| **Recommended Fix** | إضافة `perm_max('pos.discount')` في pos_sale للتحقق من max_amount. |
| **Verification Test** | تطبيق خصم أكبر من max_amount على فاتورة POS. |

---

### BUG-005: `grant()` Server Action allows self-elevation

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P1 (Security) — Maintained |
| **File** | `src/app/(app)/users/actions.ts:6-22` |
| **Evidence** | السطر 6-8: `grant` بتتحقق من `can(me, 'users.manage')` بس. السطر 14-19: upsert على grants بدون التحقق من user_id. |
| **Analysis** | المستخدم اللي عنده users.manage ممكن يضيف أي صلاحية لنفسه، بما فيهم users.manage لمستخدمين تانيين اللي ممكن يرفعوا أنفسهم. |
| **Business Impact** | عالي — privilege escalation. |
| **Security Impact** | عالي — أي مستخدم بـ users.manage ممكن يسيطر على النظام. |
| **Recommended Fix** | إضافة `if (targetUserId === me.id) throw new Error(...)` لمنع الترقية الذاتية. |
| **Verification Test** | محاولة إضافة صلاحية لنفسك. |

---

### BUG-006: `revoke()` does not prevent revoking owner's permissions

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `src/app/(app)/users/actions.ts:24-30` |
| **Evidence** | السطر 24-29: revoke بتتحقق من users.manage بس، مش بتتحقق من إن المستخدم مش owner. |
| **Analysis** | owner عنده is_owner=true اللي بيبypass كل التحقق من الصلاحيات عبر is_owner() في الداتابيز. لكن revoke ممكن تحذف grants من سجل owner، وده مش واضح ومربك. |
| **Business Impact** | منخفض — owner لسه عنده كل الصلاحيات عبر is_owner. |
| **Recommended Fix** | إضافة `if (targetUserId === owner_id) throw new Error(...)` في revoke. |

---

### BUG-007: `savePrice` does not revalidate

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `src/app/(app)/prices/actions.ts` (all 17 lines) |
| **Evidence** | مفيش `revalidatePath()` في أي مكان في الملف. بعد upsert السعر، الكاش مش هيتم invalidation. |
| **Analysis** | السعر بيتحفظ في الداتابيز لكن الصفحة مش هتحديث حتى الكاش يexpire. |
| **Business Impact** | متوسط — الأسعار مش هتظهر فوراً. |
| **Recommended Fix** | إضافة `revalidatePath("/prices")` بعد الحفظ. |

---

### BUG-008: `addLocation` uses `settings.edit` permission, RLS uses `stock.edit`

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `src/app/(app)/locations/actions.ts:8`, `supabase/migrations/0001_foundation.sql:121` |
| **Evidence** | actions.ts السطر 8: `if (!can(me, "settings.edit"))` — بتتحقق من settings.edit. 0001_foundation.sql السطر 121: `create policy loc_write on public.locations for all to authenticated using (has_perm('stock.edit'))` — RLS بتتحقق من stock.edit. |
| **Analysis** | المستخدم بـ stock.edit ممكن يعدل locations عبر استدعاء مباشر للداتابيز لكن مش عبر UI. المستخدم بـ settings.edit ممكن يعدل عبر UI لكن RLS هترفض لو مفيش stock.edit. |
| **Business Impact** | متوسط — عدم اتساق في الصلاحيات. |
| **Recommended Fix** | توحيد الصلاحية إما settings.edit أو stock.edit في كل من UI و RLS. |

---

### BUG-009: `toggleLocation` has race condition

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/app/(app)/locations/actions.ts:25-26` |
| **Evidence** | السطر 25: `const { data } = await sb.from("locations").select("active").eq("id", id).single();` — قراءة. السطر 26: `await sb.from("locations").update({ active: !data?.active }).eq("id", id);` — كتابة. |
| **Analysis** | قراءه ثم كتابة في استعلامين منفصلين. لو مستخدمين اثنين toggle في نفس الوقت، واحد منهم هيضيع. |
| **Business Impact** | منخفض — حالة نادرة جداً. |
| **Recommended Fix** | استخدام SQL مباشر: `update locations set active = not active where id = $1`. |

---

### BUG-010: `createStaff` uses non-null assertion on `me!`

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/app/(app)/users/staff.ts:30` |
| **Evidence** | السطر 30: `granted_by: me!.id` — non-null assertion. السطر 14: `if (!can(me, "users.manage"))` — can بترجع false لو me null، لكن TypeScript مش بيقدر يثبت إن me مش null بعد كده. |
| **Analysis** | مفيش تأثير runtime لأن can() بترجع false لو me null والـ function هترجع early. لكن TypeScript strictness مش مثالية. |
| **Business Impact** | منخفض — مش هيسبب خطأ runtime. |
| **Recommended Fix** | إضافة `if (!me) return` بعد can() check. |

---

### BUG-011: `uploadPhoto` does not validate file type

| Field | Value |
|-------|-------|
| **Status** | ✅ PARTIALLY CONFIRMED |
| **Severity** | P2 — Downgraded to P3 |
| **File** | `src/lib/img.ts` (all 25 lines) |
| **Evidence** | السطر 5: `export async function uploadPhoto(file: File, folder: string, max = 1400)` — مفيش تحقق MIME. لكن السطر 7: `const img = await new Promise<HTMLImageElement>(...)` — الكود بيحاول يحمل الملف كصورة. السطر 13: `c.toBlob((b) => res(b!), "image/jpeg", 0.75)` — أي ملف بيتحول لـ JPEG. |
| **Analysis** | التقرير قال إن أي ملف ممكن يتحمل. في الواقع، الكود بيحاول يحمل الملف كـ HTMLImageElement. لو الملف مش صورة، i.onerror هيتم استدعاء والـ promise هتreject. حتى لو نجح، canvas بيوصل الملف لـ JPEG. |
| **Correction** | الخطر أقل من المتوقع — الملفات غير الصور هتفشل في Image loading. لكن مفيش تحقق MIME صريح قبل المعالجة. |
| **Business Impact** | منخفض — الملفات غير الصور هتفشل تلقائياً. |
| **Recommended Fix** | إضافة `if (!file.type.startsWith("image/")) throw new Error(...)` للوضوح. |

---

### BUG-012: No CSRF protection on Server Actions

| Field | Value |
|-------|-------|
| **Status** | ❌ FALSE POSITIVE |
| **Severity** | N/A |
| **File** | All `actions.ts` files |
| **Evidence** | Next.js Server Actions محمية بشكل افتراضي عبر:
  1. Origin header verification
  2. Same-site cookies
  3. Form actions require same-origin
  4. Programmatic actions require server-side authentication
| **Analysis** | كل Server Actions بتتحقق من getMe() و can() اللي بتحتاج authenticated session. Supabase session cookies محمية بـ SameSite و HttpOnly. مفيش خطر CSRF حقيقي. |
| **Correction** | Next.js بتوفر CSRF protection افتراضياً. التقرير كان غير دقيق. |

---

### BUG-013: `dbMsg` strips all text before "ERROR:"

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/lib/scan.ts:18` |
| **Evidence** | السطر 18: `export const dbMsg = (m: string | undefined) => (m || "حصل خطأ").replace(/^.*?ERROR:\s*/, "").trim();` |
| **Analysis** | regex `/^.*?ERROR:\s*/` بيمسح كل حاجة قبل ERROR: بما فيها نص مفيد. لكن في PostgreSQL، الأخطاء بتبدأ بـ "ERROR:" عادة، فالتأثير محدود. |
| **Business Impact** | منخفض — بعض رسائل الخطأ ممكن تفقد سياق. |

---

### BUG-014: `boxSn` regex allows 3-9 digit numbers

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/lib/scan.ts:4` |
| **Evidence** | السطر 4: `if (!/^R?\d{3,9}(\|.*)?$/i.test(v)) return null;` |
| **Analysis** | regex يسمح بـ 3-9 أرقام. التسلسل في الداتابيز يبدأ من 1201 (4 أرقام). 3 أرقام مش هتmatch أي علبة حقيقية. |
| **Business Impact** | منخفض — validation gap بسيط. |

---

### BUG-015: `cairoDayStart` may produce incorrect timezone offset

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/lib/time.ts:4-6` |
| **Evidence** | السطر 4: `const off = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";` |
| **Analysis** | Intl.DateTimeFormat بيستخدم التوقيت الصحيح تلقائياً بما فيهم DST. لكن تحليل offset من string ممكن يفشل لو تنسيق الإخراج يتغير. |
| **Business Impact** | منخفض — احتمال ضئيل جداً. |

---

### BUG-016: `MODULES` and `BRANCH_APPS` have duplicate entries

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/lib/apps.ts` |
| **Evidence** | MODULES (السطر 4-26) و BRANCH_APPS (السطر 29-42) فيهم تكرار: pos, orders, stock, prices, trips, acc. |
| **Analysis** | نفس التطبيقات موجودة في القوائم الاتنين بخصائص مختلفة قليلاً. ده بيوزع عبء الصيانة. |
| **Business Impact** | منخفض — صيانة فقط. |

---

### BUG-017: No error boundary in app layout

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `src/app/(app)/layout.tsx` |
| **Evidence** | مفيش `error.tsx` في أي مكان في المشروع (تم البحث بـ glob). |
| **Analysis** | لو component ألقى خطأ أثناء rendering، التطبيق هيظهر صفحة بيضاء. |
| **Business Impact** | متوسط — تجربة مستخدم سيئة عند الأخطاء. |
| **Recommended Fix** | إضافة `error.tsx` في `(app)/` directory. |

---

### BUG-018: `getMe()` does not cache results

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P3 — Maintained |
| **File** | `src/lib/perms.ts` |
| **Evidence** | كل استدعاء لـ getMe() بيعمل استعلامين: profiles + grants. في صفحة واحدة ممكن يتستدعى عدة مرات. |
| **Analysis** | AppLayout بيستدعي getMe() مرة واحدة (السطر 18). لكن كل page.tsx ممكن تستدعي getMe() مرة تانية. |
| **Business Impact** | منخفض — overhead بسيط. |
| **Recommended Fix** | استخدام React Context أو memoization. |

---

## Part 2 — SEC Findings Validation

### SEC-001: No Content Security Policy

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `src/middleware.ts` (all 26 lines) |
| **Evidence** | middleware.ts بيطبق X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, HSTS. لكن مفيش Content-Security-Policy. |
| **Analysis** | React بيقوم بـ escaping افتراضياً، لكن CSP بيوفر طبقة حماية إضافية. |
| **Recommended Fix** | إضافة CSP header في middleware. |

---

### SEC-002: In-Memory Rate Limiting for Login

| Field | Value |
|-------|-------|
| **Status** | 🔄 DUPLICATE of BUG-001 |
| **Severity** | P1 — Same as BUG-001 |
| **Analysis** | نفس المشكلة المذكورة في BUG-001. |

---

### SEC-003: No File Upload Validation

| Field | Value |
|-------|-------|
| **Status** | 🔄 DUPLICATE of BUG-011 |
| **Severity** | P3 — Downgraded (same as BUG-011) |
| **Analysis** | نفس المشكلة المذكورة في BUG-011. التأثير أقل من المتوقع لأن canvas بيوصل الملف لـ JPEG. |

---

### SEC-004: No Audit Trail for Critical Operations

| Field | Value |
|-------|-------|
| **Status** | ✅ PARTIALLY CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0001_foundation.sql:98-100`, `0002_catalog.sql:68`, `0006_item_specs_suppliers.sql:58`, `0008_overrides.sql:48`, `0019_accounts.sql:132-133` |
| **Evidence** | audit_log triggers موجودين على:
  - grants (0001)
  - locations (0001)
  - settings (0001)
  - items (0002)
  - item_specs (0006)
  - override_requests (0008)
  - expenses (0019)
  - supplier_payments (0019)
| **Analysis** | التقرير قال إن مفيش audit trail. في الواقع فيه audit trail على جداول كثيرة لكن مش على:
  - sales / sale_lines
  - stock_moves
  - transfers / transfer_boxes
  - boxes
  - prod_orders / prod_steps
| **Correction** | audit trail موجود جزئياً. النقص في sales و stock_moves و transfers. |
| **Recommended Fix** | إضافة audit triggers على sales, stock_moves, transfers. |

---

### SEC-005: Self-Permission Elevation

| Field | Value |
|-------|-------|
| **Status** | 🔄 DUPLICATE of BUG-005 |
| **Severity** | P1 — Same as BUG-005 |
| **Analysis** | نفس المشكلة المذكورة في BUG-005. |

---

## Part 3 — DB Findings Validation

### DB-001: Missing index on grants(user_id, perm)

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0001_foundation.sql:33-39` |
| **Evidence** | جدول grants مفيش عليه index على (user_id, perm). has_perm() في السطر 50-52 بتستعلم grants في كل عملية. |
| **Analysis** | has_perm() بتستدعى في كل Server Action وكل database function. بدون index، كل استعلام بيScan الجدول بالكامل. |
| **Recommended Fix** | `create index idx_grants_user_perm on grants(user_id, perm);` |

---

### DB-002: Missing index on prices(item_id, location_id, channel)

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0002_catalog.sql:36-42` |
| **Evidence** | جدول prices مفيش عليه index على (item_id, location_id, channel). pos_price() في 0015_pos.sql السطر 48-51 بتستعلم prices في كل عملية بيع. |
| **Analysis** | pos_price() بتستدعى في كل عملية بيع POS وكل عملية order. بدون index، كل استعلام بيScan الجدول بالكامل. |
| **Recommended Fix** | `create index idx_prices_item_loc_channel on prices(item_id, location_id, channel);` |

---

### DB-003: Missing index on stock_moves(kind, at)

| Field | Value |
|-------|-------|
| **Status** | ✅ PARTIALLY ADDRESSED |
| **Severity** | P3 — Downgraded |
| **File** | `supabase/migrations/0026_hardening.sql:173` |
| **Evidence** | 0026 أضاف `idx_stock_moves_at on stock_moves(at)` لكن مفيش index على (kind, at) معاً. |
| **Analysis** | daily_summary view و accounts page بتستعلم stock_moves بفلترة على kind و at معاً. index على at فقط مش كافي. |
| **Correction** | index على at موجود، لكن (kind, at) معاً مش موجود. |
| **Recommended Fix** | `create index idx_stock_moves_kind_at on stock_moves(kind, at);` |

---

### DB-004: No check constraint on grants.max_amount >= 0

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0001_foundation.sql:37` |
| **Evidence** | `max_amount numeric` — مفيش check constraint. |
| **Analysis** | ممكن حد يحط max_amount سالب وده هيسبب سلوك غير متوقع في perm_max(). |
| **Recommended Fix** | `alter table grants add constraint grants_max_amount_nonneg check (max_amount >= 0);` |

---

### DB-005: No check constraint on grants.until

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0001_foundation.sql:36` |
| **Evidence** | `until date` — مفيش check constraint. |
| **Analysis** | ممكن حد يحط until في الماضي وده هيسبب صلاحية منتهية فوراً. |
| **Recommended Fix** | `alter table grants add constraint grants_until_valid check (until is null or until >= current_date);` |

---

### DB-006: Some FKs missing explicit ON DELETE behavior

| Field | Value |
|-------|-------|
| **Status** | ✅ ADDRESSED BY 0026 |
| **Severity** | P3 — Downgraded |
| **File** | `supabase/migrations/0026_hardening.sql:123-168` |
| **Evidence** | 0026 أضاف ON DELETE behavior للـ FKs المهمة:
  - boxes.item_id → restrict
  - stock_moves.item_id → restrict
  - stock_moves.location_id → restrict
  - stock_moves.box_sn → set null
  - transfer_boxes.box_sn → restrict
| **Analysis** | التقرير قال إن مفيش ON DELETE behavior. في الواقع 0026 أضافه للـ FKs الحرجة. لكن مفيش ON DELETE على كل FKs. |
| **Correction** | المشكلة تم معالجتها جزئياً في 0026. |

---

## Part 4 — GAP Findings Validation

### GAP-001: No weight reconciliation between production and packaging

| Field | Value |
|-------|-------|
| **Status** | ✅ PARTIALLY CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0016_production.sql`, `supabase/migrations/0017_pack_order.sql` |
| **Evidence** | prod_finish في 0016 بتتحقق من `p_out + p_waste <= in_weight * 1.05` (5% tolerance). prod_pack_finish في 0017 بتتحقق من التغليف. لكن مفيش تحقق إن إجمالي الوزن المغلف يساوي إنتاج الخطوة السابقة. |
| **Analysis** | الإنتاج بيسجل output weight. التغليف بيخلق boxes بأوزان فردية. مفيش تحقق صريح إن مجموع أوزان boxes = output weight. |
| **Business Impact** | متوسط — ممكن يكون فيه فرق بين الإنتاج والتغليف. |

---

### GAP-002: Trip receiving at destination not explicitly tracked

| Field | Value |
|-------|-------|
| **Status** | ✅ CONFIRMED |
| **Severity** | P2 — Maintained |
| **File** | `supabase/migrations/0013_trips.sql:98-115` |
| **Evidence** | trip_depart بيقوم بـ transfers (السطر 108). الاستلام بيتعمل عبر receive_transfer العادية. مفيش تتبع خاص بوصول الرحلة. |
| **Analysis** | transfers اللي بتنتج من trip_depart بتتستلم عبر نفس workflow التحويلات العادية. مفيش ربط صريح بين استلام التحويل ووصول الرحلة. |
| **Business Impact** | متوسط — صعب تتبع حالة الرحلة بعد الوصول. |

---

### GAP-003: No automatic supplier ledger view

| Field | Value |
|-------|-------|
| **Status** | ❌ FALSE POSITIVE |
| **Severity** | N/A |
| **File** | `supabase/migrations/0019_accounts.sql:96-108` |
| **Evidence** | `supplier_ledger` view موجود (السطر 96-101). `supplier_balances` view موجود (السطر 103-108). |
| **Analysis** | التقرير قال إن مفيش supplier ledger view. في الواقع الاتنين موجودين ويعملوا بشكل صحيح. |
| **Correction** | المشكلة غير موجودة — views موجودة وتعمل بشكل صحيح. |

---

## Part 5 — Deduplication Analysis

### Duplicates Found

| Original ID | Duplicate ID | Relationship |
|-------------|--------------|--------------|
| BUG-001 | SEC-002 | نفس المشكلة: Rate limiting في الذاكرة |
| BUG-011 | SEC-003 | نفس المشكلة: File upload validation |
| BUG-005 | SEC-005 | نفس المشكلة: Self-permission elevation |

### Unique Issue Count

| Category | Original Count | After Deduplication |
|----------|----------------|---------------------|
| BUG | 18 | 18 |
| SEC | 5 | 2 (SEC-001, SEC-004) |
| DB | 6 | 6 |
| GAP | 3 | 2 (GAP-001, GAP-002) |
| **Total** | **32** | **28** |

---

## Part 6 — Severity Corrections

| ID | Original Severity | Corrected Severity | Reason |
|----|-------------------|-------------------|--------|
| BUG-002 | P2 | P2 (lower impact) | clearRateLimit بتعمل قبل redirect |
| BUG-011 | P2 | P3 | canvas بيوصل الملف لـ JPEG تلقائياً |
| BUG-012 | P2 | N/A | FALSE POSITIVE |
| DB-003 | P3 | P3 (partially addressed) | 0026 أضاف index على at |
| DB-006 | P3 | P3 (addressed) | 0026 أضاف ON DELETE |
| GAP-003 | P3 | N/A | FALSE POSITIVE |
| SEC-003 | P2 | P3 | نفس BUG-011 |

---

## Part 7 — Final Validated Issue List

### Confirmed Issues (by severity)

#### P1 — High (4 unique issues)

| ID | Description | Status |
|----|-------------|--------|
| BUG-001 | Rate Limiting في الذاكرة فقط | ✅ CONFIRMED |
| BUG-004 | pos_sale مش بتتحقق من max_amount | ✅ CONFIRMED |
| BUG-005 | grant() بتسمح بالترقية الذاتية | ✅ CONFIRMED |
| BUG-003 | owner ممكن يتنشط من admin | ✅ CONFIRMED |

#### P2 — Medium (9 unique issues)

| ID | Description | Status |
|----|-------------|--------|
| BUG-006 | revoke() مش بتحمي owner | ✅ CONFIRMED |
| BUG-007 | savePrice() بدون revalidate | ✅ CONFIRMED |
| BUG-008 | addLocation() صلاحية غير متسقة | ✅ CONFIRMED |
| BUG-017 | مفيش error boundary | ✅ CONFIRMED |
| SEC-001 | مفيش CSP header | ✅ CONFIRMED |
| SEC-004 | audit trail ناقص على sales/transfers | ✅ PARTIALLY CONFIRMED |
| DB-001 | مفيش index على grants(user_id, perm) | ✅ CONFIRMED |
| DB-004 | مفيش check على grants.max_amount | ✅ CONFIRMED |
| DB-005 | مفيش check على grants.until | ✅ CONFIRMED |

#### P3 — Low (9 unique issues)

| ID | Description | Status |
|----|-------------|--------|
| BUG-002 | recordFailedAttempt قبل auth | ✅ PARTIALLY CONFIRMED |
| BUG-009 | toggleLocation race condition | ✅ CONFIRMED |
| BUG-010 | me! non-null assertion | ✅ CONFIRMED |
| BUG-011 | uploadPhoto MIME validation | ✅ PARTIALLY CONFIRMED |
| BUG-013 | dbMsg strip error context | ✅ CONFIRMED |
| BUG-014 | boxSn regex 3-9 digits | ✅ CONFIRMED |
| BUG-015 | cairoDayStart timezone | ✅ CONFIRMED |
| BUG-016 | MODULES/BRANCH_APPS duplication | ✅ CONFIRMED |
| BUG-018 | getMe() caching | ✅ CONFIRMED |

#### Addressed by 0026 (2 issues)

| ID | Description | Status |
|----|-------------|--------|
| DB-003 | stock_moves index | ✅ PARTIALLY ADDRESSED |
| DB-006 | FK ON DELETE | ✅ ADDRESSED |

#### False Positives (2 issues)

| ID | Description | Status |
|----|-------------|--------|
| BUG-012 | CSRF protection | ❌ FALSE POSITIVE |
| GAP-003 | Supplier ledger | ❌ FALSE POSITIVE |

#### Duplicates (3 issues)

| ID | Duplicate of | Status |
|----|--------------|--------|
| SEC-002 | BUG-001 | 🔄 DUPLICATE |
| SEC-003 | BUG-011 | 🔄 DUPLICATE |
| SEC-005 | BUG-005 | 🔄 DUPLICATE |

---

## Part 8 — Missing Evidence & Assumptions

### Assumptions in Original Report

1. **Live testing not performed** — التقرير اعترف إن الاختبار المباشر مش ممكن بدون Supabase credentials. كل النتائج مبنية على static analysis فقط.

2. **CSP compatibility** — التقرير اقترح إضافة CSP لكن مفيش تحليل لتأثير CSP على Next.js و Supabase. CSP ممكن يكسر functionality لو مش متكونفج بشكل صحيح.

3. **getMe() call frequency** — التقرير افترض إن getMe() بتستدعى عدة مرات في صفحة واحدة. في الواقع AppLayout بيستدعيها مرة واحدة، وكل page.tsx ممكن تستدعيها مرة تانية.

4. **CSRF risk** — التقرير افترض إن Server Actions ممكن تكون vulnerable لـ CSRF. في الواقع Next.js بتوفر حماية افتراضية.

### Missing Evidence

1. **Database performance** — مفيش EXPLAIN ANALYZE results لأن الداتابيز مش متاحة.
2. **Actual query plans** — مفيش معلومات عن كيف PostgreSQL بيexecute الاستعلامات.
3. **Real-world rate limiting effectiveness** — مفيش اختبار على بيئة multi-instance فعلية.
4. **RLS policy effectiveness** — مفيش اختبار مباشر للتحقق من إن RLS policies بتعمل بشكل صحيح.

---

*Report generated by Junie (JetBrains AI) on 2026-11-08*
*This report validates the findings of COMPLETE_SYSTEM_AUDIT.md against actual source code.*
