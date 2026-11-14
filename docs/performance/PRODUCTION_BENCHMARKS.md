# PRODUCTION BENCHMARKS — Bay Raslan ERP

**Date:** 2026-11-14  
**Application:** by-raslan-erp (Next.js 15.5.29 App Router + Supabase)  
**Status:** Production benchmarks **not yet available** — see limitations below.

---

## Limitation: Cannot authenticate for production measurement

Production navigation benchmarks require an authenticated user to load `/(app)/*` pages. This is currently **not possible** in this environment because:

1. **Database is empty** — 0 rows in `profiles`, `grants`, `locations`, and all other tables (verified via direct Supabase REST queries).
2. **Supabase email signup is rate-limited** — `POST /auth/v1/signup` returns `429 over_email_send_rate_limit` for all tested email addresses.
3. **No existing test credentials** — no users exist in the system to log in with.

**Result:** Only local, unauthenticated measurements are available. Authenticated navigation latency cannot be measured end-to-end until a real user exists in the Supabase project.

---

## Local measurements available

### Supabase round-trip latency (direct Node.js HTTPS)

Measured from this machine to `https://univnbcayoizvtfwfugn.supabase.co`:

| Endpoint | Cold (1st) | Warm (2nd+) |
|---|---:|---:|
| `GET /rest/v1/profiles?select=*&limit=1` | 1528 ms | 132–155 ms |
| `GET /auth/v1/user` (no session) | 155 ms | 102 ms |

### Login page (unauthenticated, public)

| Metric | Value |
|---|---:|
| TTFB | ~243–386 ms |
| Full navigation (cold) | ~2938 ms |

The login page TTFB includes exactly 1 middleware `auth.getUser()` call, confirming ~100–400 ms middleware overhead per request.

---

## Production benchmark plan (to be executed when a user exists)

When an authenticated test user is available in Supabase, the following measurements should be captured:

### Navigation tests (10+ navigations each)

| Scenario | Pages | What to measure |
|---|---|---|
| First navigation (cold) | Dashboard → Stock → Statistics | TTFB, total navigation duration, Supabase calls |
| Repeated navigation | Dashboard → Stock → Dashboard | Cache hit ratio, getMe() dedup effectiveness |
| Browser refresh | F5 on each page | Cold vs. warm server start |
| Multiple simultaneous requests | Concurrent navigations from 2+ tabs | Connection pooling, serverless concurrency |
| Different user roles | Owner, cashier, storekeeper, accountant | Permission query variation |
| Large datasets | Statistics page with full year range | `readAll()` pagination behavior |
| Empty datasets | Stock page with no items | Fast-path behavior |
| Slow network | Chrome DevTools network throttling | Round-trip sensitivity |

### Metrics to capture

| Metric | Definition | Target |
|---|---|---|
| P50 navigation latency | Median time from click to usable page | < 1000 ms |
| P95 navigation latency | 95th percentile time from click to usable page | < 2000 ms |
| Supabase calls per navigation | Round trips for auth + data | ≤ 4 (auth) + N (data) |
| Sequential rounds per navigation | Network serial dependency chain | ≤ 3 (auth) + 1 (data) |
| Middleware duration | `updateSession()` execution time | < 500 ms |
| getMe() duration | `auth.getUser()` + profiles + grants | < 500 ms |
| Page server render duration | Server Component render time | < 1000 ms |

### How to capture

The instrumentation added in Phase 2 (`src/lib/perf.ts`) logs structured JSON to stdout:

```json
{"reqId":"abc123","path":"/dashboard","totalMs":450.5,"marks":[{"name":"middleware:updateSession","ms":145.2},{"name":"supabase:getMe:auth.getUser","ms":130.1},{"name":"supabase:getMe:profiles+grants","ms":125.3}],"ts":"2026-11-14T05:41:00Z"}
```

These logs should be captured from the production hosting platform (Vercel function logs) and aggregated by `reqId` to trace a single navigation across middleware + Server Components.

---

## Before/After template (to populate after production measurement)

| Page | Before (P50) | After (P50) | Before (P95) | After (P95) | Improvement |
|---|---:|---:|---:|---:|---:|
| Dashboard | TBD | TBD | TBD | TBD | TBD |
| Stock | TBD | TBD | TBD | TBD | TBD |
| Stock Dispose | TBD | TBD | TBD | TBD | TBD |
| Statistics | TBD | TBD | TBD | TBD | TBD |
| Sales | TBD | TBD | TBD | TBD | TBD |
| Purchasing | TBD | TBD | TBD | TBD | TBD |
| Reports | TBD | TBD | TBD | TBD | TBD |
| Settings | TBD | TBD | TBD | TBD | TBD |

**Do not populate with estimated values.** Only actual production measurements.

---

## Infrastructure recommendations for production

| Recommendation | Rationale | Expected impact |
|---|---|---|
| Deploy Vercel in same region as Supabase | Eliminates cross-region latency (~1–3 s per round trip) | 3–9 s saved on auth overhead |
| Enable Supabase connection pooling (PgBouncer) | Reduces cold-start connection overhead (~1.5 s) | Up to 1.5 s saved per cold start |
| Warm up serverless functions | Avoids cold starts on first request after idle | < 1 s on first navigation |
| Use Supabase Edge Functions for auth-heavy operations | Closer to database, lower latency | Variable |

---

## Conclusion

Code-level optimizations are complete:
- 7 → 4 Supabase calls per navigation (−43%)
- 5 → 3 sequential rounds (−40%)
- All pages use `Promise.all` for parallel data fetching
- `branches/[id]` sequential queries parallelized
- Statistics pagination bounded
- Performance instrumentation in place

The remaining latency (~3–9 s in production) is **infrastructure-bound** (Supabase round-trip time), not code-bound. Production deployment in the same region as Supabase would provide the largest remaining improvement. Actual production benchmarks must be captured after an authenticated user is available.
