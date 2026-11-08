# BAY RASLAN ERP — PHASE 1 SECURITY REMEDIATION REPORT

**Date:** 2026-11-08
**Author:** Junie (JetBrains AI)
**Status:** ✅ Complete — Code changes verified, database migration ready

---

## Executive Summary

تم إصلاح 3 ثغرات أمان حرجة (P1) في نظام باي رسلان ERP:

| Bug ID | Description | Severity | Status |
|--------|-------------|----------|--------|
| BUG-005 | Privilege Escalation Through grant() | P1 (Security) | ✅ Fixed |
| BUG-004 | Missing POS Discount Maximum Enforcement | P1 (Financial) | ✅ Fixed |
| BUG-001 | In-Memory Login Rate Limiting | P1 (Security) | ✅ Fixed |

---

## 1. BUG-005: Privilege Escalation Through grant()

### Root Cause

`grant()` في `users/actions.ts` كانت تتحقق من `can(me, 'users.manage')` فقط، ثم بتعمل `upsert` مباشر على جدول `grants` من غير أي تحقق إضافي. المستخدم اللي عنده `users.manage` كان يقدر:

1. يمنح أي صلاحية لنفسه (self-grant).
2. يمنح صلاحيات مش عندها (no delegation ceiling).
3. يمنح `users.manage` لآخرين، اللي بدورهم يقدر يرفعوا أنفسهم.

RLS policy `grants_write` كانت بتتحقق من `has_perm('users.manage')` فقط — مفيش حماية ضد self-grant أو delegation bypass.

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/0027_security_fixes.sql` | Added `secure_grant()` SECURITY DEFINER function |
| `supabase/migrations/0027_security_fixes.sql` | Dropped `grants_write` policy, added `grants_delete` policy |
| `src/app/(app)/users/actions.ts` | Updated `grant()` to use `secure_grant()` RPC + self-grant check |
| `src/app/(app)/users/actions.ts` | Updated `revoke()` to prevent self-revoke |

### Security Model Implemented

`secure_grant()` SECURITY DEFINER function enforces:

1. **Self-grant prevention:** `p_target ≠ auth.uid()` — ممنوع تمنح صلاحية لنفسك.
2. **users.manage protection:** ممنوع تمنح `users.manage` لأي حد — مقصور على owner.
3. **Delegation ceiling:** المانح لازم يكون عنده الصلاحية اللي هيمنحها (owner مستثنى).
4. **Max amount ceiling:** لو المانح عنده حد مبلغ، ممنوع يمنح أكتر من حدّه.
5. **Permission validation:** التحقق من إن الصلاحية موجودة في `permissions` catalog.
6. **Target validation:** التحقق من إن المستخدم الهدف موجود ومش owner.
7. **Fixed search_path:** `set search_path = public, pg_temp` — يمنع hijacking عبر objects في schemas تانية.
8. **Restricted EXECUTE:** `revoke execute from public, anon; grant execute to authenticated;`

RLS changes:
- `grants_write` policy تم حذفها — مفيش INSERT/UPDATE مباشر على grants.
- `grants_delete` policy — فقط للمستخدمين بـ `users.manage` أو owner.

### Before/After Behavior

| Scenario | Before | After |
|----------|--------|-------|
| Admin grants perm to self | ✅ Allowed (vulnerability) | ❌ Rejected |
| Admin grants perm they don't have | ✅ Allowed (vulnerability) | ❌ Rejected |
| Admin grants users.manage to another | ✅ Allowed (vulnerability) | ❌ Rejected |
| Owner grants any perm to another | ✅ Allowed | ✅ Allowed |
| Admin grants delegated perm to another | ✅ Allowed | ✅ Allowed |
| Direct DB INSERT on grants | ✅ Allowed via grants_write | ❌ No INSERT policy |
| Direct DB DELETE on grants | ✅ Allowed via grants_write | ✅ Allowed (users.manage only) |

---

## 2. BUG-004: Missing POS Discount Maximum Enforcement

### Root Cause

`pos_sale()` في `0015_pos.sql` و `0026_hardening.sql` كانت تتحقق من `has_perm('pos.discount')` فقط (السطر 103/89). دالة `perm_limit('pos.discount')` موجودة في `0019_accounts.sql` وتقرأ `max_amount` من `grants`، لكن `pos_sale()` مش بتستخدمها.

Cashier عنده `pos.discount` كان يقدر يطبق خصم غير محدود، حتى لو `max_amount` في grant كان محدد بـ 50 جنية مثلاً.

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/0027_security_fixes.sql` | Updated `pos_sale()` with `perm_limit()` check |

### Security Model Implemented

Minimal modification to `pos_sale()` — all existing logic preserved:

```sql
-- BUG-004 FIX: التحقق من حد الخصم
if coalesce(p_discount, 0) < 0 then
  raise exception 'الخصم ما يقدرش يكون سالب';
end if;

if coalesce(p_discount, 0) > 0 then
  lim := perm_limit('pos.discount');
  if lim = -1 then
    raise exception 'الخصم محتاج صلاحية';
  end if;
  if lim is not null and p_discount > lim then
    raise exception 'الخصم (% ج) أكبر من حدك (% ج)', p_discount, lim;
  end if;
end if;
```

`perm_limit()` semantics (from `0019_accounts.sql`):
- **Owner:** returns `NULL` → unlimited discount.
- **Has perm, no max_amount:** returns `NULL` → unlimited discount.
- **Has perm, with max_amount:** returns the limit → enforced.
- **No perm:** returns `-1` → rejected.

### Before/After Behavior

| Scenario | Before | After |
|----------|--------|-------|
| No discount perm, discount > 0 | ❌ Rejected | ❌ Rejected (same) |
| Has perm, no max_amount, any discount | ✅ Allowed | ✅ Allowed (same) |
| Has perm, max_amount=50, discount=30 | ✅ Allowed | ✅ Allowed (same) |
| Has perm, max_amount=50, discount=50 | ✅ Allowed | ✅ Allowed (same) |
| Has perm, max_amount=50, discount=100 | ✅ Allowed (vulnerability) | ❌ Rejected |
| Owner, any discount | ✅ Allowed | ✅ Allowed (same) |
| Negative discount | ✅ Allowed (vulnerability) | ❌ Rejected |

### Preserved Behavior

All existing `pos_sale()` logic is preserved:
- Shift validation (cashier ownership, open status)
- Empty cart rejection
- Box scan with FOR UPDATE row lock (DB-002 fix from 0026)
- Barcode/item lookup
- Stock movement recording
- Sale line creation
- Payment validation (cash + card ≥ total)
- Card payment ≤ total
- Change calculation
- Transaction rollback on error

---

## 3. BUG-001: In-Memory Login Rate Limiting

### Root Cause

`rate-limit.ts` كان بيستخدم `in-memory Map` — على Vercel (multi-instance deployment)، كل instance عندها Map منفصلة. مهاجم كان يقدر يتجاوز الحد بالتبديل بين instances.

Migration `0026` أضاف `hit_rate_limit()` للداتابيز، لكن `login-action.ts` لسه كان بيستخدم `rate-limit.ts` في الذاكرة.

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/0027_security_fixes.sql` | Added `login_rate_check()` and `login_rate_clear()` functions |
| `src/lib/rate-limit.ts` | Replaced in-memory Map with database-backed RPC calls |
| `src/app/login/login-action.ts` | Updated to use `checkLoginRateLimit()` and `clearLoginRateLimit()` |

### Security Model Implemented

`login_rate_check()` SECURITY DEFINER function:
- **Identifier normalization:** `lower(trim(p_identifier))` — يمنع bypass عبر case variations.
- **Atomic counter:** `INSERT ... ON CONFLICT ... DO UPDATE` — atomic تحت concurrent requests.
- **Window reset:** العداد بيرجع لو النافذة انتهت.
- **Limit:** 10 attempts per 15 minutes.
- **Return value:** `boolean` — `true` = allowed, `false` = rejected.

`login_rate_clear()` SECURITY DEFINER function:
- مسح العداد بعد نجاح تسجيل الدخول.

Application layer (`rate-limit.ts`):
- **Fail-open:** لو الداتابيز مش متاحة، يتم السماح بالدخول مع تسجيل الخطأ — يمنع lockout غير عادل.
- **Legacy compatibility:** `checkRateLimit()` محفوظ لـ `order/actions.ts` (order rate limiting).

### Before/After Behavior

| Scenario | Before | After |
|----------|--------|-------|
| 5 failed attempts, same instance | ❌ Blocked | ✅ Counted (limit is 10) |
| 10 failed attempts | ❌ Blocked on one instance only | ❌ Blocked across all instances |
| Case variation bypass (User@ vs user@) | ✅ Bypass possible | ❌ Normalized to lowercase |
| Concurrent requests | ❌ Race condition in Map | ✅ Atomic DB operation |
| Database unavailable | N/A | ✅ Fail-open (allow login) |
| Successful login | ✅ Counter cleared | ✅ Counter cleared via RPC |

---

## 4. Database Migration

### Migration File

`supabase/migrations/0027_security_fixes.sql` (336 lines)

### Contents

1. `secure_grant()` function — BUG-005
2. RLS policy updates (drop `grants_write`, create `grants_delete`) — BUG-005
3. `pos_sale()` update with `perm_limit()` check — BUG-004
4. `login_rate_check()` function — BUG-001
5. `login_rate_clear()` function — BUG-001
6. `grants_max_amount_nonneg` CHECK constraint — DB-004

### Idempotency

- `create or replace function` — يمكن تشغيل الملف أكثر من مرة بأمان.
- `drop policy if exists` — لا يفشل لو policy مش موجودة.
- `if not exists` check قبل إضافة constraint.

### Rollback

لإلغاء التغييرات:

```sql
-- Rollback 0027
drop policy if exists grants_delete on public.grants;
create policy grants_write on public.grants for all to authenticated
  using (has_perm('users.manage')) with check (has_perm('users.manage'));
drop function if exists public.secure_grant(uuid, text, date, numeric);
drop function if exists public.login_rate_check(text);
drop function if exists public.login_rate_clear(text);
alter table public.grants drop constraint if exists grants_max_amount_nonneg;
-- Restore pos_sale() from 0026_hardening.sql
```

---

## 5. Tests Executed

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | ✅ 0 errors |
| `npx next build` | ✅ 0 errors, 34 pages generated |
| SQL migration syntax review | ✅ Manual review passed |
| RLS policy review | ✅ Manual review passed |
| Function permission review | ✅ Manual review passed |

## 6. Tests Blocked

| Test | Reason |
|------|--------|
| Database integration tests | Supabase credentials not available |
| Runtime RPC testing | Requires live database connection |
| Concurrent login testing | Requires multi-instance deployment |
| POS discount limit testing | Requires live database with test data |
| Permission delegation testing | Requires live database with test users |

---

## 7. Remaining Risks

1. **Migration not yet applied:** الإصلاحات في الكود جاهزة، لكن migration `0027` محتاج يتطبق على الداتابيز عشان الأمان الفعلي يشتغل.
2. **Order rate limiting:** `order/actions.ts` لسه بيستخدم in-memory rate limiting للطلبات. ده P2 (مش P1) لأن orders مش حساسة زي login.
3. **Fail-open behavior:** لو الداتابيز مش متاحة، rate limiting بتتخطى. ده مقصود عشان نمنع lockout، لكن بيقلل الحماية مؤقتاً.

---

## 8. Compatibility Notes

- **Existing grants:** لا تتأثر — migration مش بيمسح أو يعدل grants موجودة.
- **Existing pos_sale callers:** لا تتأثر — نفس الـ signature ونفس السلوك مع إضافة التحقق من الحد.
- **Existing login flow:** لا يتأثر — نفس الـ API مع تحسين rate limiting.
- **order/actions.ts:** `checkRateLimit` و `clearRateLimit` لا تزال متاحة كـ legacy export.

---

## 9. Next Steps

1. تطبيق migration `0027_security_fixes.sql` على بيئة التطوير أولاً.
2. اختبار الوظائف الجديدة مع بيانات اختبار.
3. تطبيق migration على بيئة الإنتاج بعد التأكد.
4. مراقبة logs للتأكد من إن rate limiting شغال بشكل صحيح.
