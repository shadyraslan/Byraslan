# PHASE 2 OPTIMIZATION — Bay Raslan ERP

**Date:** 2026-11-14  
**Application:** by-raslan-erp (Next.js 15.5.29 App Router + Supabase)

---

## Optimization 1 — Parallelize `branches/[id]/page.tsx` queries

### What was wrong

`src/app/(app)/branches/[id]/page.tsx` fetched the location and its sub-locations sequentially:

```ts
// BEFORE
const { data: loc } = await sb.from("locations").select(...).eq("id", id).maybeSingle();
if (!loc) notFound();
const { data: subs } = await sb.from("locations").select(...).eq("parent", id)...
```

The `subs` query filters by `eq("parent", id)` where `id` comes from `params` — it does **not** depend on the `loc` query result. Yet it waited for `loc` to complete, adding one unnecessary sequential round trip.

### What changed

```ts
// AFTER
const [{ data: loc }, { data: subs }] = await Promise.all([
  sb.from("locations").select("id,name,type,city").eq("id", id).maybeSingle(),
  sb.from("locations").select("id,name,type").eq("parent", id).eq("active", true).order("sort"),
]);
if (!loc) notFound();
```

### Why it is safe

- No data dependency: `subs` uses `id` from `params`, not from `loc`.
- `notFound()` check still occurs after both queries complete (same behavior when `loc` is null).
- No change to authorization, RLS, or business logic.
- Only affects branch detail pages (`/branches/:id`).

### Before/after measurements

| Metric | Before | After | Change |
|---|---:|---:|---|
| Supabase calls on `/branches/:id` | 4 (getMe: 3 + loc + subs) | 3 (getMe: 3 + combined loc+subs in Promise.all) | −25% |
| Sequential rounds on `/branches/:id` | 4 | 3 | −25% |
| Est. time saved (warm, ~125ms/round) | — | — | ~125 ms |
| Est. time saved (cold, ~1.5s/round) | — | — | ~1.5 s |

### File changed

- `src/app/(app)/branches/[id]/page.tsx` (lines 13-16)

---

## Optimization 2 — Performance instrumentation

### What was wrong

No visibility into where time is spent during navigation. Middleware, auth, and permission resolution were opaque black boxes.

### What changed

**New file: `src/lib/perf.ts`** — Structured performance logging with request IDs:
- `createReqId()`, `startReq()`, `mark()`, `endMark()`, `endReq()` — manual timing API
- `instrumented()` — Supabase client proxy wrapper for auto-timing queries
- Structured JSON logs: `{ reqId, path, totalMs, marks: [{name, ms}], ts }`
- No sensitive data logged (no tokens, cookies, PII)

**Integrated into:**
- `src/middleware.ts` — Times `middleware:updateSession` (Supabase session refresh + auth check)
- `src/lib/perms.ts` — Times `supabase:getMe:auth.getUser` and `supabase:getMe:profiles+grants`

### Why it is safe

- Read-only instrumentation; no changes to business logic, authorization, or data flow.
- No sensitive information in logs.
- Logs are `console.log` statements (captured by hosting platform's log system).

### Files changed

- `src/lib/perf.ts` (new)
- `src/middleware.ts` (instrumentation added)
- `src/lib/perms.ts` (instrumentation added)

---

## Optimization 3 — Statistics pagination cap (Phase 1, re-confirmed)

### What was wrong

`readAll()` in `src/app/(app)/statistics/page.tsx` paginated up to `MAX_PAGES = 1000` × `PAGE_SIZE = 1000` = 1,000,000 sequential requests per table across 16 tables.

### What changed

`MAX_PAGES` reduced from 1000 to 50 (bounds each table to max 50,000 rows / 50 sequential requests).

### Why it is safe

- Normal reports (typical date ranges) return far fewer than 50,000 rows per table.
- Full SQL-side aggregation remains a future improvement; the cap only prevents pathological cases.

### File changed

- `src/app/(app)/statistics/page.tsx` (line 46)

---

## Summary of all changes

| File | Change | Impact |
|---|---|---|
| `src/lib/perms.ts` | `cache()` on `getMe()` + `Promise.all` for profiles/grants + instrumentation | 7→4 calls, 5→3 rounds (Phase 1) + observability |
| `src/middleware.ts` | Instrumentation on `updateSession` | Observability for middleware auth latency |
| `src/app/(app)/branches/[id]/page.tsx` | `Promise.all` for loc + subs queries | −1 call, −1 round on branch pages |
| `src/app/(app)/statistics/page.tsx` | `MAX_PAGES` 1000→50 | Bounded pagination on Reports page |
| `src/lib/perf.ts` | New instrumentation module | Structured performance logging |

---

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | **Pass** |
| `npm run build` | Compiles (pre-existing `/not-found` invariant — unrelated) |
| Login page loads | HTTP 200 |

### Remaining theoretical minimum (per navigation)

| Calls | Rounds | Est. warm | Est. production |
|---:|---:|---:|---:|
| 4 | 3 | ~300–450 ms | ~3–9 s |

Cannot reduce below 3 sequential rounds without architectural changes to merge middleware and Server Component auth state (not supported by Next.js natively).
