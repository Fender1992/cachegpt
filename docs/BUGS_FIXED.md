# Bugs Fixed During Free Tier Pivot

## Build Errors

### 1. Suspense Boundary Missing on `/donate` Page
- **Symptom:** `yarn build` failed with: `useSearchParams() should be wrapped in a suspense boundary at page "/donate"`
- **Root Cause:** Next.js 16 requires `useSearchParams()` to be inside a `<Suspense>` boundary for static generation
- **File:** `app/donate/page.tsx`
- **Fix:** Split the component into a wrapper (`DonatePage`) that provides `<Suspense>` and an inner component (`DonateContent`) that calls `useSearchParams()`

## Pre-Pivot Fixes (Phase 0)

### 2. Dashboard Stats 401 Error
- **Symptom:** Dashboard API calls returned 401 Unauthorized
- **Fix:** Added `Bearer` token prefix to Authorization header

### 3. Teams Auto-Connect Error
- **Symptom:** Console errors from Teams auto-connect on pages where it wasn't needed
- **Fix:** Silenced the error for non-critical paths

### 4. Type Error in Settings INTEGRATIONS Array
- **Symptom:** TypeScript error on `comingSoon` property in integrations config
- **Fix:** Updated the type definition to include the `comingSoon` property

### 5. Duplicate Settings and Dashboard Routes
- **Symptom:** Conflicting route definitions caused build warnings
- **Fix:** Consolidated duplicate pages into single route definitions
