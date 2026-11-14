# PERFORMANCE BASELINE — Bay Raslan ERP

**Date:** 2026-11-14  
**Application:** by-raslan-erp (Next.js 15.5.29 App Router + Supabase)  
**Environment:** localhost:3000 (Next.js dev server), Node v24.14.0  
**Supabase host:** univnbcayoizvtfwfugn.supabase.co (remote, public internet)  
**Database state:** EMPTY — 0 rows in profiles, grants, locations, boxes, stock_moves, online_orders, sales (verified via direct Supabase REST queries)

---

## 1. Measurement Methodology

Measurements were taken using:
- Direct Node.js `https` requests to the Supabase REST API (measures server-to-server round-trip latency)
- Playwright browser automation with `performance.getEntriesByType('navigation')` and `'resource'` (measures browser navigation timing)
- Code inspection of every route page, layout, middleware, and lib function

Note: The local database is empty, so data-volume-driven slowness cannot be reproduced locally. All slowness is therefore architectural (network round trips, redundant requests, sequential queries). In production (Vercel serverless + cross-region Supabase), each round trip carries additional cold-start and cross-region latency, multiplying the measured local values.

---

## 2. Network Baseline — Supabase Round-Trip Latency

Measured directly from Node.js to `https://univnbcayoizvtfwfugn.supabase.co` (3 consecutive runs):

| Endpoint | Run 1 | Run 2 | Run 3 | Notes |
|---|---:|---:|---:|---|
| `GET /rest/v1/profiles?select=*&limit=1` | 1528 ms | 155 ms | 132 ms | First = cold TLS/connection; rest = warm |
| `GET /auth/v1/user` (no session) | 155 ms | 102 ms | 102 ms | Returns 401 (no auth cookie) |

**Conclusion:** Each Supabase round trip costs ~100–150 ms on a warm connection and ~1.5 s on a cold connection (new TCP/TLS). These are server-side calls invisible to the browser's Network panel — they happen in Next.js middleware and Server Components.

---

## 3. Page-Load Baseline (Browser)

### Login page (`/login`) — public, no auth

| Metric | Value |
|---|---:|
| TTFB (responseStart − fetchStart) | ~386 ms (first run) / ~243 ms (after server restart) |
| Full navigation duration | ~2938 ms (first visit, cold) |
| Redirect count | 0 |
| Supabase calls visible in browser | 0 (middleware auth runs server-side) |

The login page TTFB includes the middleware's single `supabase.auth.getUser()` call. This confirms **every request pays ~100–400 ms for the middleware auth round trip** before any page rendering begins.

---

## 4. Navigation Chain — Authenticated Pages (per navigation)

Every navigation to an `/(app)/*` route triggers this sequence **before any page-specific data is fetched**:

| Step | Location | Supabase calls | Sequential? |
|---|---|---|---|
| 1 | Middleware (`src/middleware.ts`) | `auth.getUser()` = 1 call | — |
| 2 | AppLayout (`src/app/(app)/layout.tsx`) | `getMe()` → `auth.getUser()` + `profiles` + `grants` = 3 calls | **Sequential** (3 `await`s) |
| 3 | Each page (e.g. `dashboard/page.tsx`, `stock/page.tsx`, etc.) | `getMe()` → `auth.getUser()` + `profiles` + `grants` = 3 calls | **Sequential** (3 `await`s) |
| 4 | Each page | Page-specific data queries (e.g. `locations`, `sales`, `boxes`, etc.) | N calls, mostly `Promise.all` |

**Total before page data:** **7 sequential Supabase round trips** (1 middleware + 3 layout + 3 page)  
**Sequential rounds:** 5 (middleware auth → layout auth → layout profiles → layout grants → page auth → page profiles → page grants, with layout and page getMe() calls serialized)

### Per-page getMe() call sites (verified by code inspection)

| Page | getMe() called? |
|---|---|
| `src/app/(app)/layout.tsx` | Yes (line 9) |
| `src/app/(app)/dashboard/page.tsx` | Yes (line 9) |
| `src/app/(app)/stock/page.tsx` | Yes (line 10) |
| `src/app/(app)/stock/dispose/page.tsx` | Yes |
| `src/app/(app)/statistics/page.tsx` | Yes (line 249) |
| `src/app/(app)/sales/page.tsx` | Yes (line 11) |
| `src/app/(app)/purchasing/page.tsx` | Yes (line 15) |
| `src/app/(app)/orders/page.tsx` | Yes (line 12) |
| `src/app/(app)/production/page.tsx` | Yes (line 13) |
| `src/app/(app)/settings/page.tsx` | Yes (line 26) |
| (all other `/(app)/*` pages) | Yes |

`getMe()` is implemented in `src/lib/perms.ts` and performs **three sequential awaits**:
1. `sb.auth.getUser()` — must come first (provides `user.id`)
2. `sb.from("profiles").select(...).eq("id", user.id)` — depends on #1
3. `sb.from("grants").select(...).eq("user_id", user.id)` — depends on #1, **independent of #2 but awaited sequentially**

---

## 5. Secondary Issue — Statistics Page Unbounded Pagination

`src/app/(app)/statistics/page.tsx` defines:

```ts
const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
```

The `readAll()` helper paginates through **every row** of up to 16 tables in parallel, making up to `1000 × 1000 = 1,000,000` sequential requests **per table**. Tables are fetched in parallel via `Promise.all`, but each table's pagination is strictly sequential. With production data volumes this alone can add minutes to the Reports page. (Locally the DB is empty so each `readAll` returns on the first empty batch.)

---

## 6. Issues Ruled Out

| Suspected cause | Finding |
|---|---|
| Large frontend bundle | Dependencies are minimal: `next`, `react`, `@supabase/ssr`, `@supabase/supabase-js`, `react-icons`, `qrcode.react`. No heavy client libraries. |
| Excessive client-side rendering | Pages are Server Components; only `login/page.tsx` is `"use client"`. |
| Data volume / full-table scans | Database is empty (0 rows in all tables). Not a factor locally. |
| Duplicate client-side API calls | No client-side data fetching; all fetching is server-side. |
| Missing React Suspense / code splitting | Not applicable — App Router SSR with no lazy boundaries needed for these pages. |

---

## 7. Summary of Baseline Findings

| Metric | Value |
|---|---|
| Supabase round trip (warm) | ~100–150 ms |
| Supabase round trip (cold) | ~1.5 s |
| Sequential Supabase calls per authenticated navigation | **7** |
| Sequential network rounds per authenticated navigation | **5** |
| Middleware auth overhead on every request | 1 call (~100–400 ms TTFB contribution) |
| `getMe()` called redundantly | layout + every page (3× per navigation) |
| `getMe()` internal calls parallelized? | **No** — profiles and grants awaited sequentially |
| Statistics `readAll()` max pages | 1000 (up to 1M sequential requests per table) |
| Database data volume | Empty (not a factor) |

**Primary bottleneck:** 7 sequential Supabase round trips (≈700 ms–10.5 s locally, much more in production with cold starts/cross-region latency) incurred on **every** navigation before page data loads. This is the architectural root cause of the 20+ second navigation delays.
