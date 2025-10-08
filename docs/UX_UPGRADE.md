# CacheGPT Casual UI/UX Upgrade

**Status:** Phase 0 Complete (Infrastructure) - October 6, 2025
**Branch:** `feat/casual-ui-phase0-setup`
**Goal:** Transform CacheGPT for casual users while preserving power features

---

## Overview

This upgrade adds:
- **Friendly Landing Page** - Instant clarity, zero jargon
- **Guided Chat Experience** - Example prompts, voice input, file upload
- **Modes/Templates** - One-click use cases (Writing, Coding, Study, etc.)
- **Casual Dashboard** - Simple analytics + achievements/badges
- **Gamified Touches** - Cache-hit toasts, badges, progress tracking
- **Feature Flags** - Safe gradual rollout with A/B testing
- **Telemetry** - Funnel analytics and user behavior tracking

---

## Implementation Phases

### ✅ Phase 0: Infrastructure (COMPLETE)

**Branch:** `feat/casual-ui-phase0-setup`
**Status:** Merged to branch, ready for review

#### What Was Built

1. **Feature Flag System** (`lib/featureFlags.ts`)
   - Resolution hierarchy: ENV → DB → User overrides → Defaults
   - 60-second in-memory caching
   - A/B test cohort assignment via user ID hashing
   - 13 flags total (all default OFF for safe rollout)

2. **Telemetry System**
   - Client (`lib/telemetry.ts`): Batched events, auto-retry, beforeunload handling
   - Server (`lib/telemetry-server.ts`): Validation, aggregations, PII filtering
   - API (`/api/telemetry`): POST for events, GET for admin debugging
   - 20+ event types across landing, chat, modes, dashboard

3. **Database Schema** (`database-scripts/034_casual_ui_infrastructure.sql`)
   - `feature_flags`: Global + user-specific flag overrides
   - `telemetry_events`: Raw event storage with RLS
   - `telemetry_daily_agg`: Pre-aggregated metrics for performance
   - `public_modes`: 6 seeded templates (Writing Assistant, Coding Buddy, etc.)
   - `user_achievements`: Gamified badges (first_10_chats, cache_hero_80, etc.)

4. **TypeScript Types**
   - `types/featureFlags.d.ts`: 13 flag keys with type-safe values
   - `types/telemetry.d.ts`: 20+ discriminated union event types

#### Feature Flags Added

| Flag | Default | Purpose |
|------|---------|---------|
| `ui_casual_landing` | OFF | New landing page |
| `ui_casual_chat` | OFF | Chat UI refresh |
| `ui_modes` | OFF | Modes/templates system |
| `ui_casual_dashboard` | OFF | Casual dashboard |
| `ux_gamified_toasts` | OFF | Cache hit notifications |
| `ux_voice_input` | OFF | Web Speech API input |
| `ux_file_upload` | OFF | File context upload |
| `ux_cache_badges` | OFF | Inline cache indicators |
| `ux_example_prompts` | OFF | Example prompt cards |
| `ab_landing_hero_copy_v1` | A | A/B test: Hero copy |
| `ab_example_prompts_layout_v1` | grid | A/B test: Prompt layout |
| `ab_onboarding_flow_v1` | old | A/B test: Onboarding |

#### Seeded Modes

1. **Writing Assistant** (slug: `writing-assistant`)
   - Icon: ✍️
   - System prompt: Concise, clear, structured writing help
   - Examples: "Rewrite this email...", "Outline an essay...", etc.

2. **Coding Buddy** (slug: `coding-buddy`)
   - Icon: 💻
   - System prompt: Pragmatic code examples, debugging, best practices
   - Examples: "Fix this TypeScript error...", "Explain this regex...", etc.

3. **Study Helper** (slug: `study-helper`)
   - Icon: 📚
   - System prompt: Patient teaching, simple explanations, practice questions
   - Examples: "Explain photosynthesis...", "Create quiz questions...", etc.

4. **Idea Generator** (slug: `idea-generator`)
   - Icon: 💡
   - System prompt: Creative brainstorming, diverse ideas, feasibility
   - Examples: "Blog post ideas...", "Startup concepts...", etc.

5. **Explain Anything** (slug: `explain-anything`)
   - Icon: 🧠
   - System prompt: Complex→simple, concrete examples, avoid jargon
   - Examples: "How does blockchain work?", "Quantum computing...", etc.

6. **Fact Finder** (slug: `fact-finder`)
   - Icon: 🔍
   - System prompt: Accurate research, fact-checking, cite sources
   - Examples: "Population of Tokyo?", "Nobel Prize winners...", etc.

#### Telemetry Events

**Landing:** `landing_view`, `landing_cta_click_primary`, `landing_cta_click_secondary`
**Chat:** `chat_loaded`, `example_prompt_clicked`, `message_sent`, `cache_hit_notice_shown`, `voice_input_used`, `file_uploaded`
**Modes:** `modes_view`, `mode_selected`, `mode_used_in_chat`
**Dashboard:** `dashboard_view`, `badge_awarded`, `stats_loaded`
**Settings:** `settings_view`, `theme_changed`, `provider_key_added`

#### Files Created

```
types/
├── featureFlags.d.ts          # 13 flag keys, type-safe
└── telemetry.d.ts             # 20+ event types

lib/
├── featureFlags.ts            # Server flag resolution (300+ lines)
├── telemetry.ts               # Client batching (200+ lines)
└── telemetry-server.ts        # Server processing (200+ lines)

app/api/
└── telemetry/route.ts         # POST events, GET admin (100 lines)

database-scripts/
└── 034_casual_ui_infrastructure.sql  # All tables + seed data (500+ lines)
```

---

### 🔨 Phase 1: Landing Page (IN PROGRESS)

**Branch:** `feat/casual-ui-landing`
**Status:** Ready to start

#### Components to Build

- `components/landing/Hero.tsx` - Big friendly hero with animated typing
- `components/landing/TrustBar.tsx` - "Used by developers worldwide"
- `components/landing/FeatureCards.tsx` - 3-up: Ask Anything / Lightning Fast / Zero Setup
- `components/landing/Callouts.tsx` - Secondary CTAs and social proof
- `components/landing/Footer.tsx` - Links, legal, social

#### A/B Test Variants

**Variant A (Control):**
> "Your AI, instantly. No setup. No API keys."

**Variant B (Test):**
> "Chat with AI. Write, code, learn - all for free."

#### Acceptance Criteria

- ✅ When `ui_casual_landing` ON, new landing seen
- ✅ Lighthouse score ≥ 90/90/90 (Performance/A11y/SEO)
- ✅ OpenGraph + Twitter cards
- ✅ Telemetry: `landing_view`, `landing_cta_click_*`
- ✅ Mobile responsive (iPhone 14, iPad)
- ✅ Dark mode support

---

### 🔨 Phase 2: Chat UI Refresh (PENDING)

**Branch:** `feat/casual-ui-chat`
**Status:** Waiting for Phase 1

#### Changes

- Top bar: Logo, presets dropdown ("Smart", "Creative", "Code"), profile
- Example prompts grid (empty state only):
  - "Write me a 3-day meal plan"
  - "Explain today's top news"
  - "Help me debug this JS function"
  - "5 biz ideas I could start this weekend"
- Input enhancements:
  - Voice input (Web Speech API, flag: `ux_voice_input`)
  - File upload (size/type limits, flag: `ux_file_upload`)
- Cache indicators:
  - Inline badge: "⚡ from cache"
  - Toast: "You saved 2¢!" (flag: `ux_gamified_toasts`)
- Left sidebar: Home, My Chats, Analytics, Modes, Settings

#### Components

- `components/chat/ExamplePrompts.tsx`
- `components/chat/CacheBadge.tsx`
- `components/chat/Toast.tsx` (reusable)
- `components/chat/ModelPreset.tsx`

---

### 🔨 Phase 3: Modes/Templates (PENDING)

**Branch:** `feat/casual-ui-modes`
**Status:** Waiting for Phase 2

#### API

- `GET /api/modes` - Returns all active modes (cached at edge)

#### UI

- `/modes` page - Grid of 6 mode cards
- Click mode → redirect to `/chat?mode=writing-assistant`
- Chat page reads `mode` param, shows banner "Mode: Writing Assistant"

#### Telemetry

- `modes_view`, `mode_selected`, `mode_used_in_chat`

---

### 🔨 Phase 4: Casual Dashboard (PENDING)

**Branch:** `feat/casual-ui-dashboard`
**Status:** Waiting for Phase 3

#### Features

- Cards: Total chats, cache hits (%), top model
- Line chart: "Your AI activity (last 14 days)"
- Badges: first_10_chats, cache_hero_80, prompt_master_100
- Simple, friendly copy (not enterprise metrics)

---

### 🔨 Phase 5: Settings Polish (PENDING)

**Branch:** `feat/casual-ui-settings`
**Status:** Waiting for Phase 4

#### Tabs

- Profile, Providers, Themes, Privacy
- Themes: Light/Dark/Solarized/Neon (CSS vars)
- Privacy: Plain-English copy, transparent about data storage

---

### 🔨 Phase 6: Telemetry Wiring (PENDING)

**Branch:** `feat/casual-ui-flags-telemetry`
**Status:** Waiting for Phase 5

#### Tasks

- Wire all event tracking across UI components
- Admin dashboard for flag toggles
- Funnel report page (landing → chat → message)

---

### 🔨 Phase 7: QA & Rollout (PENDING)

**Branch:** `feat/casual-ui-rollout`
**Status:** Final phase

#### Tests

- Unit (Vitest): Flag resolution, mode selection, toast logic
- Integration: Chat with/without mode, cache badge rendering
- E2E (Playwright): Landing → Chat → Send → Dashboard

#### Rollout Plan

1. `ui_casual_landing`: 10% → 50% → 100%
2. `ui_casual_chat`: 10% → 50% → 100%
3. `ui_modes`: 50% → 100%
4. `ui_casual_dashboard`: 100%

---

## How to Use Feature Flags

### Enable a Flag for Testing

```bash
# Via environment variable (highest priority)
export FEATURE_UI_CASUAL_LANDING=true
```

### Enable for Specific User

```sql
-- In Supabase SQL Editor
INSERT INTO public.feature_flags (key, value, enabled, user_id)
VALUES ('ui_casual_landing', 'true'::jsonb, true, 'user-uuid-here');
```

### Enable Globally

```sql
UPDATE public.feature_flags
SET value = 'true'::jsonb, enabled = true
WHERE key = 'ui_casual_landing' AND user_id IS NULL;
```

### Disable a Feature

```sql
UPDATE public.feature_flags
SET enabled = false
WHERE key = 'ui_casual_landing';
```

---

## Rollback Procedure

If a feature causes issues:

1. **Immediate:** Set flag to OFF in environment
   ```bash
   export FEATURE_UI_CASUAL_LANDING=false
   ```

2. **Database:** Disable globally
   ```sql
   UPDATE public.feature_flags SET enabled = false WHERE key = 'ui_casual_landing';
   ```

3. **Invalidate cache:** Flag cache TTL is 60s, changes take effect within 1 minute

4. **Code rollback:** Revert PR if database toggle isn't sufficient

---

## Monitoring

### Funnel Metrics

```sql
SELECT
  date,
  SUM(CASE WHEN event_type = 'landing_view' THEN count ELSE 0 END) as landing_views,
  SUM(CASE WHEN event_type = 'chat_loaded' THEN count ELSE 0 END) as chat_loads,
  SUM(CASE WHEN event_type = 'message_sent' THEN count ELSE 0 END) as messages
FROM telemetry_daily_agg
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY date
ORDER BY date DESC;
```

### Conversion Rates

```typescript
// Server-side
import { getFunnelMetrics } from '@/lib/telemetry-server';

const metrics = await getFunnelMetrics(
  new Date('2025-10-01'),
  new Date('2025-10-07')
);

console.log({
  landingToChatRate: (metrics.chatLoads / metrics.landingViews) * 100,
  chatToMessageRate: (metrics.firstMessages / metrics.chatLoads) * 100,
  returnRate: (metrics.returnUsers / metrics.firstMessages) * 100,
});
```

---

## Success Criteria

### Quantitative

- Landing → Chat CTR: ≥ 30% (baseline: ~10%)
- Chat → First Message: ≥ 60% (baseline: ~40%)
- 7-day return rate: ≥ 20% (baseline: ~5%)
- Cache hit toast engagement: ≥ 40% click-through

### Qualitative

- Lighthouse scores ≥ 90/90/90
- Zero critical accessibility violations
- No regressions for power users (BYOK, CLI)
- Positive user feedback on modes/templates

---

## FAQ

### Q: Can I disable all new features at once?

A: Yes, set all `ui_*` and `ux_*` flags to OFF. The app reverts to the classic experience.

### Q: How do I test the new landing page locally?

A: Set `export FEATURE_UI_CASUAL_LANDING=true` before running `yarn dev`.

### Q: What if telemetry breaks?

A: Telemetry is non-blocking. Failed requests are retried 3x, then dropped. No impact on core functionality.

### Q: Are modes required for chat to work?

A: No. Modes are optional enhancements. Chat works without selecting a mode.

---

## Contributing

See phases above. Each phase is a separate branch and PR. Follow the git workflow:

1. Branch from `main`: `git checkout -b feat/casual-ui-phaseN`
2. Build features with tests
3. Open PR with:
   - Summary, screenshots/GIFs
   - Risk assessment
   - Flags touched
   - Telemetry events added
4. QA checklist (see below)
5. Merge to `main`, enable flags gradually

---

## QA Checklist (copy to each PR)

- [ ] Flag default OFF verified (check code + DB seed)
- [ ] No 500s in server logs (check Vercel logs)
- [ ] a11y labels present (run `axe` DevTools)
- [ ] Keyboard nav works (tab through all interactive elements)
- [ ] Lighthouse ≥ 90/90/90 (run audit in DevTools)
- [ ] Telemetry fired (check Network panel for `/api/telemetry`)
- [ ] SSR/CSR hydration warnings resolved (check console)
- [ ] Mobile layout tested (iPhone 14, iPad)
- [ ] Dark mode looks good (toggle in settings)
- [ ] No breaking changes to existing APIs (run integration tests)

---

## Contact

Questions? Ping the team or check:
- Implementation plan: This doc
- Technical details: `STATUS_2025_09_24.md`
- Database schema: `database-scripts/034_casual_ui_infrastructure.sql`
