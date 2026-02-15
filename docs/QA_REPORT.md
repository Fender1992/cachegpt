# QA Build Report

**Date:** 2025-02-15
**Node:** v22.22.0
**Next.js:** 16.1.6 (Turbopack)

## Build Status: PASS

`yarn build` completes successfully with no TypeScript errors and no build failures.

## Zod Version

- `package.json` specifies `"zod": "^4.1.11"`
- Build compiles and runs without issues with this version
- **No change needed** -- zod v4 is compatible with the current codebase

## Non-Blocking Warnings

| Warning | Severity | Notes |
|---------|----------|-------|
| `baseline-browser-mapping` data over two months old | Info | Cosmetic; run `yarn add baseline-browser-mapping@latest -D` to silence |
| `middleware` file convention deprecated in Next.js 16 | Low | Should migrate to `proxy` convention eventually |
| Edge runtime disables static generation | Info | Expected behavior for dynamic routes |
| `LLM_ALLOW_FALLBACK_TO_PREMIUM=false` log messages | Info | Runtime config, not a build issue |
| Unmet peer dependencies for `@sentry/opentelemetry` | Low | OpenTelemetry peer deps not installed; Sentry still functions |

## Build Errors Found and Fixed

### Suspense Boundary for `/donate` Page
- **Error:** `useSearchParams()` must be wrapped in a Suspense boundary at `/donate`
- **File:** `app/donate/page.tsx`
- **Fix:** Split into `DonatePage` (wrapper with `<Suspense>`) and `DonateContent` (inner component using `useSearchParams()`)
- **Result:** Build passes, page renders correctly as static

## Upgrade CTA Audit

Searched for remaining upgrade prompts across all `.ts`, `.tsx`, `.js`, `.jsx` files:
- "Upgrade to Pro" -- **not found**
- "Upgrade Plan" -- **not found**
- "upgradeUrl" -- **not found**
- "upgrade your plan" -- **not found**

All upgrade CTAs have been successfully removed.

## Key Files Verified

| File | Status |
|------|--------|
| `database-scripts/051_free_tier_pivot.sql` | Present |
| `database-scripts/052_donations_table.sql` | Present |
| `app/api/donate/route.ts` | Present |
| `app/donate/page.tsx` | Present |
| `app/donate/success/page.tsx` | Present |
| `app/sitemap.ts` | Present |
| `app/robots.ts` | Present |

## Pages Generated

123 pages total (static + dynamic). All compiled successfully.

## Summary

The project builds cleanly after one fix (Suspense boundary). No upgrade CTAs remain. All donation and SEO files are in place.
