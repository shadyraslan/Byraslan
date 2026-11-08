# BAY RASLAN ERP — FINAL IMPLEMENTATION PLAN

**Date:** 2026-11-08
**Author:** Junie (JetBrains AI)
**Source:** FINAL_FINDINGS_REGISTRY.md
**Status:** Ready for review — no code changes yet

---

## Overview

خطة تنفيذ مقسمة إلى 5 مراحل صغيرة ومستقلة.
كل مرحلة ممكن تتراجع لو لزم.
الترتيب من P1 (حرج) لـ P3 (تحسين).

---

## Phase 1 — Critical Security Fixes (P1)

### 1.1 BUG-005: منع الترقية الذاتية في grant()

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-005 |
| **Severity** | P1 (Security) |
| **Files to modify** | `src/app/(app)/users/actions.ts` |
| **Migration required** | لا (اختياري: RLS policy إضافية) |
| **Dependencies** | لا |
| **Effort** | ~5 أسطر |

**Implementation Details:**

في `grant()` function، إضافة تحقق قبل upsert:

```typescript
// في users/actions.ts grant()
const targetUserId = String(fd.get("user_id"));
if (targetUserId === me.id) {
  throw new Error("ممكنش تمنح صلاحية لنفسك — اتصل بالمسؤول");
}
```

**Database RLS Enhancement (Optional but recommended):**

```sql
-- إضافة شرط في policy grants_write لمنع self-grant
create policy grants_write on public.grants for all to authenticated
  using (has_perm('users.manage'))
  with check (has_perm('users.manage') and user_id <> auth.uid());
```

**Regression Tests:**
1. مستخدم بـ users.manage يحاول يمنح صلاحية لنفسه → يرفض
2. مستخدم بـ users.manage يمنح صلاحية لمستخدم تاني → يقبل
3. owner يمنح صلاحية لنفسه → يقبل (owner exception)

**Security Impact:** يمنع privilege escalation عبر self-grant.
**Risk of breaking:** منخفض — التحقق الإضافي مش هيؤثر على الاستخدام الطبيعي.
**Rollback Strategy:** إزالة السطر المضاف.

---

### 1.2 BUG-004: إضافة max_amount validation للخصم في pos_sale

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-004 |
| **Severity** | P1 (Financial) |
| **Files to modify** | `supabase/migrations/0027_pos_discount_limit.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | ~15 سطر SQL |

**Implementation Details:**

في migration جديد، تعديل دالة `pos_sale` لتستخدم `perm_limit('pos.discount')`:

```sql
create or replace function public.pos_sale(p_shift bigint, p_lines jsonb, p_discount numeric, p_cash numeric, p_card numeric)
returns table (sale_id bigint, sale_no bigint, total numeric, change numeric)
language plpgsql security invoker set search_path = public as $$
declare sh shifts%rowtype; l jsonb; i int := 0; r record; sub numeric := 0; tot numeric; sid bigint; sno bigint; seen bigint[] := '{}'; ch numeric; disc_lim numeric;
begin
  if not has_perm('pos.sell') then raise exception 'محتاج صلاحية البيع'; end if;
  select * into sh from shifts where id = p_shift and cashier = auth.uid() and status = 'open';
  if not found then raise exception 'افتح وردية الأول'; end if;
  if jsonb_array_length(coalesce(p_lines, '[]')) = 0 then raise exception 'الفاتورة فاضية'; end if;
  
  -- التحقق من حد الخصم
  if coalesce(p_discount, 0) > 0 then
    if not has_perm('pos.discount') then raise exception 'الخصم محتاج صلاحية'; end if;
    disc_lim := perm_limit('pos.discount');
    if disc_lim <> -1 and disc_lim is not null and p_discount > disc_lim then
      raise exception 'الخصم (% ج) أكبر من حدك (% ج)', p_discount, disc_lim;
    end if;
  end if;
  
  -- ... باقي الكود كما هو ...
```

**Regression Tests:**
1. cashier بـ pos.discount بـ max_amount=100 يحاول خصم 50 → يقبل
2. cashier بـ pos.discount بـ max_amount=100 يحاول خصم 150 → يرفض
3. cashier بـ pos.discount بـ max_amount=null (مفتوح) يحاول خصم أي مبلغ → يقبل
4. cashier من غير pos.discount يحاول خصم → يرفض
5. owner يحاول خصم أي مبلغ → يقبل

**Security Impact:** يمنع سرقة عبر الخصم غير المحدود.
**Risk of breaking:** متوسط — لو فيه cashiers عندهم pos.discount من غير max_amount، هيتأثروا. الحل: تأكد إن كل grants عندها max_amount مناسب.
**Rollback Strategy:** استعادة دالة pos_sale الأصلية من 0026.

---

### 1.3 BUG-001: نقل Login Rate Limiting للداتابيز

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-001 |
| **Severity** | P1 (Security) |
| **Files to modify** | `src/app/login/login-action.ts`, `supabase/migrations/0027_login_rate_limit.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | ~30 سطر |

**Implementation Details:**

Migration 0026 أضاف `hit_rate_limit()` بالفعل. المطلوب هو استخدامة في login-action.ts:

```sql
-- في migration 0027
-- دالة hit_rate_limit موجودة بالفعل في 0026
-- نحتاج دالة خاصة بالـ login
create or replace function public.hit_login_rate_limit(p_identifier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.hit_rate_limit('login:' || p_identifier, 5, 900000); -- 5 محاولات / 15 دقيقة
end $$;
```

في `login-action.ts`:

```typescript
// استبدال recordFailedAttempt بـ hit_login_rate_limit
const sb = await supabaseServer();
try {
  await sb.rpc('hit_login_rate_limit', { p_identifier: email });
} catch (e: any) {
  if (e.message.includes('عدد المحاولات كبير')) {
    return { ok: false, error: 'تجارب دخول كثيرة. حاول بعد شوية' };
  }
}
```

**Regression Tests:**
1. 5 محاولات دخول فاشلة من نفس email → المحاولة السادسة ترفض
2. بعد 15 دقيقة → المحاولة تقبل
3. دخول ناجح → مسح العداد (اختياري)
4. محاولات من emails مختلفة → كل واحد عنده عداد منفصل

**Security Impact:** Rate limiting بيشتغل على multi-instance (Vercel).
**Risk of breaking:** منخفض — hit_rate_limit موجودة ومختبرة.
**Rollback Strategy:** استعادة rate-limit.ts الأصلي.

---

## Phase 2 — Owner Protection & Permission Fixes (P2)

### 2.1 BUG-003: حماية owner من إلغاء التنشيط

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-003 |
| **Severity** | P2 |
| **Files to modify** | `src/app/(app)/users/staff.ts` |
| **Migration required** | لا (اختياري: RLS) |
| **Dependencies** | لا |
| **Effort** | ~3 أسطر |

**Implementation Details:**

في `setStaffActive()`:

```typescript
export async function setStaffActive(fd: FormData) {
  const me = await getMe();
  const admin = supabaseAdmin();
  if (!can(me, "users.manage") || !admin) return;
  const id = String(fd.get("id"));
  if (id === me!.id) return;
  
  // حماية owner
  const { data: target } = await admin.from("profiles").select("is_owner").eq("id", id).single();
  if (target?.is_owner) return; // مفيش حد يقدر يلغي تنشيط owner
  
  const active = fd.get("active") === "1";
  // ... باقي الكود
}
```

**Database RLS Enhancement (Recommended):**

```sql
-- منع تعديل active لـ owner
create policy profiles_write on public.profiles for update to authenticated
  using (id = auth.uid() or has_perm('users.manage'))
  with check (
    has_perm('users.manage') or (id = auth.uid() and is_owner = (select p.is_owner from profiles p where p.id = auth.uid()))
  );
-- إضافة: منع تغيير active لـ owner
alter policy profiles_write on public.profiles
  to authenticated
  using (id = auth.uid() or has_perm('users.manage'))
  with check (
    (has_perm('users.manage') and not exists (select 1 from profiles where id = auth.uid() and is_owner))
    or (id = auth.uid() and is_owner = (select p.is_owner from profiles p where p.id = auth.uid()))
  );
```

**Regression Tests:**
1. admin يحاول يلغي تنشيط owner → يرفض
2. admin يلغي تنشيط مستخدم عادي → يقبل
3. owner يلغي تنشيط نفسه → يرفض (الحماية الحالية)

**Security Impact:** يمنع lockout للمالك.
**Risk of breaking:** منخفض — التحقق الإضافي مش هيؤثر على الاستخدام الطبيعي.
**Rollback Strategy:** إزالة التحقق.

---

### 2.2 BUG-006: حماية صلاحيات owner من revoke

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-006 |
| **Severity** | P2 |
| **Files to modify** | `src/app/(app)/users/actions.ts` |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~5 أسطر |

**Implementation Details:**

في `revoke()`:

```typescript
export async function revoke(fd: FormData) {
  const me = await getMe();
  if (!can(me, "users.manage")) throw new Error("ليس لديك صلاحية إدارة المستخدمين");
  
  const targetUserId = String(fd.get("user_id"));
  const sb = await supabaseServer();
  
  // حماية owner
  const { data: target } = await sb.from("profiles").select("is_owner").eq("id", targetUserId).single();
  if (target?.is_owner) throw new Error("ممكنش تسحب صلاحيات المالك");
  
  await sb.from("grants").delete().eq("user_id", targetUserId).eq("perm", String(fd.get("perm")));
  revalidatePath("/users");
}
```

**Regression Tests:**
1. admin يحاول يسحب صلاحية من owner → يرفض
2. admin يسحب صلاحية من مستخدم عادي → يقبل

**Security Impact:** يمنع حذف صلاحيات owner بالخطأ.
**Risk of breaking:** منخفض.
**Rollback Strategy:** إزالة التحقق.

---

### 2.3 BUG-007: إضافة revalidatePath لـ savePrice

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-007 |
| **Severity** | P2 |
| **Files to modify** | `src/app/(app)/prices/actions.ts` |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~2 أسطر |

**Implementation Details:**

```typescript
import { revalidatePath } from "next/cache";

export async function savePrice(...): Promise<Result<{ v: number | null }>> {
  // ... الكود الحالي
  const { error } = await sb.from("prices").upsert({ item_id: item, location_id: loc, channel, price: v });
  if (error) return { ok: false, error: dbMsg(error.message) };
  revalidatePath("/prices");
  return { ok: true, v };
}
```

**Regression Tests:**
1. تعديل سعر → الصفحة تتحدث فوراُ

**Risk of breaking:** منخفض جداً.
**Rollback Strategy:** إزالة السطر.

---

### 2.4 BUG-008: توحيد صلاحية locations

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-008 |
| **Severity** | P2 |
| **Files to modify** | `src/app/(app)/locations/actions.ts` أو `supabase/migrations/0028_location_perm.sql` |
| **Migration required** | نعم (لو غيرنا RLS) |
| **Dependencies** | لا |
| **Effort** | ~3 أسطر |

**Implementation Details:**

الخيار الأفضل: تغيير RLS لتطابق UI (settings.edit):

```sql
-- في migration 0028
drop policy if exists loc_write on public.locations;
create policy loc_write on public.locations for all to authenticated
  using (has_perm('settings.edit'))
  with check (has_perm('settings.edit'));
```

أو تغيير UI لتطابق RLS (stock.edit):

```typescript
// في locations/actions.ts
if (!can(me, "stock.edit")) throw new Error("ليس لديك صلاحية تعديل المواقع");
```

**Recommendation:** استخدام `settings.edit` في الاتنين لأن locations هي إعدادات النظام مش مخزون.

**Regression Tests:**
1. مستخدم بـ settings.edit يعدل locations → يقبل
2. مستخدم بـ stock.edit فقط يعدل locations → يرفض (لو استخدمنا settings.edit)

**Risk of breaking:** متوسط — لو فيه مستخدمين عندهم stock.edit من غير settings.edit، هيتأثروا.
**Rollback Strategy:** استعادة الصلاحية الأصلية.

---

### 2.5 BUG-017: إضافة error boundary

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-017 |
| **Severity** | P2 |
| **Files to modify** | `src/app/(app)/error.tsx` (جديد) |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~20 سطر |

**Implementation Details:**

```tsx
"use client";
import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("App error:", error); }, [error]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "2rem" }}>
      <h1>حصل خطأ في التطبيق</h1>
      <p>{error.message}</p>
      <button onClick={() => reset()} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>حاول تاني</button>
    </div>
  );
}
```

**Regression Tests:**
1. component يلقي خطأ → يظهر error boundary مش صفحة بيضاء

**Risk of breaking:** منخفض جداً.
**Rollback Strategy:** حذف الملف.

---

### 2.6 SEC-001: إضافة Content Security Policy

| Field | Value |
|-------|-------|
| **Finding ID** | SEC-001 |
| **Severity** | P2 |
| **Files to modify** | `src/middleware.ts` |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~10 أسطر |

**Implementation Details:**

```typescript
// في middleware.ts
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js يحتاج unsafe-inline
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https:", // Supabase API
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

response.headers.set("Content-Security-Policy", csp);
```

**Regression Tests:**
1. التطبيق يشتغل بدون CSP errors في console
2. الصور والفيديوهات بتشتغل
3. Supabase API calls بتشتغل

**Risk of breaking:** متوسط — CSP ممكن يكسر functionality لو مش مضبوط.
**Rollback Strategy:** إزالة السطر.

---

### 2.7 SEC-004: إضافة Audit Trail للجداول الحرجة

| Field | Value |
|-------|-------|
| **Finding ID** | SEC-004 |
| **Severity** | P2 |
| **Files to modify** | `supabase/migrations/0028_audit_trail.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | ~15 سطر SQL |

**Implementation Details:**

```sql
-- Audit triggers على الجداول الحرجة
create trigger audit_sales after insert or update or delete on public.sales for each row execute function public.audit();
create trigger audit_sale_lines after insert or update or delete on public.sale_lines for each row execute function public.audit();
create trigger audit_stock_moves after insert or update or delete on public.stock_moves for each row execute function public.audit();
create trigger audit_transfers after insert or update or delete on public.transfers for each row execute function public.audit();
create trigger audit_transfer_boxes after insert or update or delete on public.transfer_boxes for each row execute function public.audit();
create trigger audit_boxes after insert or update or delete on public.boxes for each row execute function public.audit();
create trigger audit_prod_orders after insert or update or delete on public.prod_orders for each row execute function public.audit();
create trigger audit_prod_steps after insert or update or delete on public.prod_steps for each row execute function public.audit();
```

**Regression Tests:**
1. عملية بيع → سجل في audit_log
2. حركة مخزن → سجل في audit_log
3. تحويل → سجل في audit_log

**Risk of breaking:** منخفض — audit trigger مش هيؤثر على الأداء بشكل ملحوظ.
**Rollback Strategy:** حذف triggers.

---

## Phase 3 — Database Performance & Constraints (P2/P3)

### 3.1 DB-001: Index على grants(user_id, perm)

| Field | Value |
|-------|-------|
| **Finding ID** | DB-001 |
| **Severity** | P2 |
| **Files to modify** | `supabase/migrations/0029_indexes.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | 1 سطر SQL |

**Implementation Details:**

```sql
create index if not exists idx_grants_user_perm on public.grants(user_id, perm);
```

**Query Benefit:** `has_perm()` بتستدعى في كل عملية. بدون index، كل استعلام بيScan الجدول بالكامل.
**Write Cost:** ضئيل — جدول صغير.

---

### 3.2 DB-002: Index على prices(item_id, location_id, channel)

| Field | Value |
|-------|-------|
| **Finding ID** | DB-002 |
| **Severity** | P2 |
| **Files to modify** | `supabase/migrations/0029_indexes.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | 1 سطر SQL |

**Implementation Details:**

```sql
create index if not exists idx_prices_item_loc_channel on public.prices(item_id, location_id, channel);
```

**Query Benefit:** `pos_price()` بتستدعى في كل عملية بيع.
**Write Cost:** ضئيل — جدول متوسط.

---

### 3.3 DB-003: Index إضافي على stock_moves(kind, at)

| Field | Value |
|-------|-------|
| **Finding ID** | DB-003 |
| **Severity** | P3 |
| **Files to modify** | `supabase/migrations/0029_indexes.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | 1 سطر SQL |

**Implementation Details:**

```sql
create index if not exists idx_stock_moves_kind_at on public.stock_moves(kind, at);
```

**Query Benefit:** `daily_summary` view بتفلتر على kind و at معاُ.
**Write Cost:** متوسط — جدول كبير.

---

### 3.4 DB-004: Check constraint على grants.max_amount >= 0

| Field | Value |
|-------|-------|
| **Finding ID** | DB-004 |
| **Severity** | P2 |
| **Files to modify** | `supabase/migrations/0030_constraints.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | 1 سطر SQL |

**Implementation Details:**

```sql
alter table public.grants add constraint grants_max_amount_nonneg check (max_amount >= 0);
```

**Risk of breaking:** متوسط — لو فيه max_amount سالب في البيانات الحالية، migration هيحتاج NOT VALID.
**Rollback Strategy:** `alter table public.grants drop constraint grants_max_amount_nonneg;`

---

### 3.5 DB-005: Check constraint على grants.until

| Field | Value |
|-------|-------|
| **Finding ID** | DB-005 |
| **Severity** | P2 |
| **Files to modify** | `supabase/migrations/0030_constraints.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | 1 سطر SQL |

**Implementation Details:**

```sql
-- مفيش حاجة محتاجة check constraint على until
-- has_perm() بتستبعد grants المنتهية تلقائياُ
-- DB-005 تم تخفيضه لـ P3 — التأثير محدود
```

**Correction:** بعد المراجعة، `has_perm()` بتستبعد grants المنتهية تلقائياُ (until >= current_date). فالتأثير محدود جداً. **تم إلغاء هذا البند من الخطة.**

---

## Phase 4 — Code Quality Improvements (P3)

### 4.1 BUG-002: نقل recordFailedAttempt بعد التحقق

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-002 |
| **Severity** | P3 |
| **Files to modify** | `src/app/login/login-action.ts` |
| **Migration required** | لا |
| **Dependencies** | Phase 1.3 (BUG-001) |
| **Effort** | ~5 أسطر |

**Implementation Details:**

```typescript
export async function loginAction(_: unknown, fd: FormData) {
  // ... التحقق من المدخلات
  
  // تحويل الموبايل لإيميل داخلي
  const login = /^[+\d\s-]+$/.test(email) ? `${email.replace(/\D/g, "")}@staff.byraslan.app` : email;
  
  // ... Supabase setup
  
  const { error } = await supabase.auth.signInWithPassword({ email: login, password });
  
  if (error) {
    // تسجيل المحاولة الفاشلة بعد التحقق
    // (لو استخدمنا hit_login_rate_limit، مش محتاجين recordFailedAttempt)
    return { ok: false, error: "الموبايل/الإيميل أو الرقم السري غلط" };
  }
  
  // نجاح — مسح سجل المحاولات
  clearRateLimit(email);
  return { ok: true };
}
```

**Note:** لو Phase 1.3 تم تنفيذها (نقل rate limiting للداتابيز)، ده مش محتاج.

---

### 4.2 BUG-009: إصلاح toggleLocation race condition

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-009 |
| **Severity** | P3 |
| **Files to modify** | `src/app/(app)/locations/actions.ts` |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~3 أسطر |

**Implementation Details:**

```typescript
export async function toggleLocation(fd: FormData) {
  const me = await getMe();
  if (!can(me, "settings.edit")) throw new Error("ليس لديك صلاحية تعديل حالة المواقع");
  const sb = await supabaseServer();
  const id = String(fd.get("id"));
  // استخدام SQL مباشر لتجنب race condition
  await sb.rpc('toggle_location_active', { loc_id: id });
  revalidatePath("/locations");
}
```

```sql
-- في migration
create or replace function public.toggle_location_active(p_loc_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_active boolean;
begin
  update locations set active = not active where id = p_loc_id returning active into v_active;
  if not found then raise exception 'الموقع ده مش موجود'; end if;
  return v_active;
end $$;
```

---

### 4.3 BUG-010: إصلاح non-null assertion

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-010 |
| **Severity** | P3 |
| **Files to modify** | `src/app/(app)/users/staff.ts` |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~2 أسطر |

**Implementation Details:**

```typescript
export async function createStaff(_: unknown, fd: FormData): Promise<Result<{ name: string }> | null> {
  const me = await getMe();
  if (!can(me, "users.manage")) return { ok: false, error: "محتاج صلاحية إدارة المستخدمين" };
  if (!me) return { ok: false, error: "محتاج تسجيل دخول" }; // إضافة
  // ... باقي الكود باستخدام me.id بدل me!.id
}
```

---

### 4.4 BUG-011: إضافة MIME type validation

| Field | Value |
|-------|-------|
| **Finding ID** | BUG-011 |
| **Severity** | P3 |
| **Files to modify** | `src/lib/img.ts` |
| **Migration required** | لا |
| **Dependencies** | لا |
| **Effort** | ~3 أسطر |

**Implementation Details:**

```typescript
export async function uploadPhoto(file: File, folder: string, max = 1400): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("الملف مش صورة");
  }
  // ... باقي الكود
}
```

---

## Phase 5 — Integration Gaps (Business Analysis)

### 5.1 GAP-001: Production-Packaging Weight Reconciliation

| Field | Value |
|-------|-------|
| **Finding ID** | GAP-001 |
| **Severity** | P2 (Business) |
| **Files to modify** | تحليل أعمال |
| **Migration required** | ممكن |
| **Dependencies** | فهم العمليات |
| **Effort** | تحليل + تنفيذ |

**Analysis:**

النظام الحالي:
1. `prod_finish` بتتحقق من `p_out + p_waste <= in_weight * 1.05` (5% tolerance)
2. `prod_pack_finish` بتحسب `sum(weight)` من boxes وتضعها كـ out_weight
3. مفيش تحقق إن مجموع أوزان boxes = output weight من الخطوة السابقة

**Recommendation:**

GAP-001 مش مشكلة تقنية — ده قرار أعمال. النظام الحالي بيستخدم prod_order للربط بين الإنتاج والتغليف. أي فرق هيكون واضح في التقارير. لو العميل محتاج تحقق صارم، نضيف:

```sql
-- في prod_pack_finish
if abs(v_out - st.in_weight) > st.in_weight * 0.05 then
  raise warning 'فرق الوزن بين الإنتاج والتغليف (% كجم)', abs(v_out - st.in_weight);
end if;
```

**Decision Required:** هل العميل محتاج رفض التغليف لو الفرق أكبر من 5%؟

---

### 5.2 GAP-002: Trip Receiving Tracking

| Field | Value |
|-------|-------|
| **Finding ID** | GAP-002 |
| **Severity** | P2 (Business) |
| **Files to modify** | `supabase/migrations/0031_trip_tracking.sql` (جديد) |
| **Migration required** | نعم |
| **Dependencies** | لا |
| **Effort** | ~10 سطر SQL |

**Analysis:**

النظام الحالي:
1. `trip_depart` بيخلق transfers مرتبطة بـ trip_id
2. الاستلام بيتعمل عبر `receive_transfer` العادية
3. مفيش تتبع خاص بوصول الرحلة

**Recommendation:**

إضافة view لتتبع حالة الرحلات:

```sql
create or replace view public.trip_status with (security_invoker = true) as
select t.id, t.no, t.truck, t.driver, t.status, t.left_at,
  count(distinct tr.id) as total_transfers,
  count(distinct case when tr.status = 'received' then tr.id end) as received_transfers,
  count(distinct case when tr.status = 'transit' then tr.id end) as transit_transfers,
  case when count(distinct tr.id) = count(distinct case when tr.status = 'received' then tr.id end)
    and count(distinct tr.id) > 0 then 'delivered' else t.status end as effective_status
from trips t
left join transfers tr on tr.trip_id = t.id
group by t.id;
```

**Decision Required:** هل العميل محتاج إشعار تلقائي لما الرحلة تخلص؟

---

## Migration Summary

| Migration | Purpose | Files |
|-----------|---------|-------|
| **0027** | POS discount limit + Login rate limit | `0027_pos_discount_limit.sql`, `0027_login_rate_limit.sql` |
| **0028** | Location permission + Audit trail | `0028_location_perm.sql`, `0028_audit_trail.sql` |
| **0029** | Indexes | `0029_indexes.sql` |
| **0030** | Constraints | `0030_constraints.sql` |
| **0031** | Trip tracking view | `0031_trip_tracking.sql` |

---

## Risk Assessment

| Phase | Risk Level | Breaking Risk | Rollback Complexity |
|-------|-----------|---------------|---------------------|
| Phase 1 (P1) | عالي | منخفض | بسيط |
| Phase 2 (P2) | متوسط | متوسط | بسيط |
| Phase 3 (DB) | منخفض | منخفض | بسيط |
| Phase 4 (P3) | منخفض | منخفض جداً | بسيط |
| Phase 5 (Gaps) | يعتمد على القرار | يعتمد على القرار | يعتمد على القرار |

---

## Acceptance Criteria

### Phase 1
- [ ] مستخدم ميقدرش يمنح صلاحية لنفسه
- [ ] cashier ميقدرش يطبق خصم أكبر من max_amount
- [ ] Login rate limiting بيشتغل على multi-instance

### Phase 2
- [ ] admin ميقدرش يلغي تنشيط owner
- [ ] admin ميقدرش يسحب صلاحيات owner
- [ ] تعديل السعر بيحدث الصفحة فوراُ
- [ ] صلاحية locations موحدة
- [ ] error boundary بيظهر عند الأخطاء
- [ ] CSP header موجود
- [ ] audit_log يسجل العمليات الحرجة

### Phase 3
- [ ] Indexes موجودة
- [ ] Check constraints موجودة

### Phase 4
- [ ] recordFailedAttempt بعد التحقق
- [ ] toggleLocation من غير race condition
- [ ] non-null assertion أصلح
- [ ] MIME type validation موجود

### Phase 5
- [ ] قرار أعمال حول GAP-001
- [ ] view لتتبع حالة الرحلات

---

*Implementation plan generated by Junie (JetBrains AI) on 2026-11-08*
*Ready for review — no code changes yet*
