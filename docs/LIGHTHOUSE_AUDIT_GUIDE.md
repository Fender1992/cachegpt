# Lighthouse Audit Guide

## Objective
Achieve scores ≥ 90/90/90 for Performance, Accessibility, Best Practices, and SEO on both landing pages.

## Prerequisites

1. **Build the production app:**
   ```bash
   yarn build
   ```

2. **Start production server:**
   ```bash
   yarn start
   ```

3. **Open Chrome/Edge browser** (DevTools required)

## Running Audits

### Method 1: Chrome DevTools (Recommended)

1. Open the page to audit:
   - Main landing: `http://localhost:3000`
   - Enterprise landing: `http://localhost:3000/enterprise`

2. Open DevTools:
   - **Windows/Linux:** `F12` or `Ctrl+Shift+I`
   - **Mac:** `Cmd+Option+I`

3. Navigate to "Lighthouse" tab
   - If not visible, click the `>>` icon and select "Lighthouse"

4. Configure audit:
   - **Mode:** Desktop (test both Desktop and Mobile)
   - **Categories:** Check all (Performance, Accessibility, Best Practices, SEO)
   - **Device:** Desktop or Mobile
   - Click "Analyze page load"

5. Wait for audit to complete (30-60 seconds)

6. Review scores:
   - ✅ Green (90-100): Excellent
   - ⚠️ Orange (50-89): Needs improvement
   - ❌ Red (0-49): Poor

### Method 2: Lighthouse CI (Automated)

```bash
# Install Lighthouse CLI
npm install -g @lhci/cli

# Run audit
lhci autorun --config=lighthouserc.json
```

## Target Scores

| Category | Target | Priority |
|----------|--------|----------|
| Performance | ≥ 90 | HIGH |
| Accessibility | ≥ 90 | HIGH |
| Best Practices | ≥ 90 | MEDIUM |
| SEO | ≥ 90 | HIGH |

## Common Issues & Fixes

### Performance (Target: ≥ 90)

**Issue:** Large JavaScript bundles
- **Fix:** Use dynamic imports for heavy components
- **Fix:** Enable Next.js bundle analyzer to find large dependencies

**Issue:** Unused CSS/JS
- **Fix:** Remove unused Tailwind classes with PurgeCSS
- **Fix:** Use `next/dynamic` for code splitting

**Issue:** Images not optimized
- **Fix:** Use `next/image` component (already done)
- **Fix:** Serve images as WebP format
- **Fix:** Add `sizes` attribute for responsive images

**Issue:** Slow server response time
- **Fix:** Enable Edge Runtime for API routes
- **Fix:** Add `Cache-Control` headers
- **Fix:** Use static generation where possible

### Accessibility (Target: ≥ 90)

**Issue:** Missing alt text on images
- **Fix:** Add descriptive `alt` attributes to all `<img>` tags

**Issue:** Insufficient color contrast
- **Fix:** Ensure text has 4.5:1 contrast ratio (WCAG AA)
- **Tool:** Use Chrome DevTools "Accessibility" panel

**Issue:** Missing ARIA labels
- **Fix:** Add `aria-label` to interactive elements without visible text
- **Example:** Icon-only buttons need `aria-label="Button name"`

**Issue:** Keyboard navigation broken
- **Fix:** Ensure all interactive elements are focusable
- **Fix:** Add visible focus indicators (`:focus` styles)

### Best Practices (Target: ≥ 90)

**Issue:** Mixed content (HTTP on HTTPS page)
- **Fix:** Ensure all resources use HTTPS
- **Fix:** Update any hardcoded HTTP URLs

**Issue:** Browser console errors
- **Fix:** Check browser console for errors during page load
- **Fix:** Fix all React hydration warnings

**Issue:** Deprecated APIs
- **Fix:** Update dependencies to latest versions
- **Fix:** Replace deprecated React lifecycle methods

### SEO (Target: ≥ 90)

**Issue:** Missing meta description
- **Fix:** Already added in `app/page.tsx` and `app/enterprise/page.tsx` ✅

**Issue:** Missing structured data
- **Fix:** Add JSON-LD schema for Organization/WebSite
- **Example:**
  ```json
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "CacheGPT",
    "description": "Your AI, instantly. Save 80% on LLM costs.",
    "url": "https://cachegpt.app"
  }
  ```

**Issue:** Links not crawlable
- **Fix:** Ensure all `<a>` tags have valid `href` attributes
- **Fix:** Avoid `onClick` handlers without `href`

**Issue:** Document doesn't have a valid `hreflang`
- **Fix:** Add `<link rel="alternate" hreflang="en" href="...">` if supporting multiple languages

## Optimization Checklist

### Before Running Audit

- [ ] Build production app (`yarn build`)
- [ ] Start production server (`yarn start`)
- [ ] Clear browser cache
- [ ] Test in incognito/private mode
- [ ] Disable browser extensions

### Images

- [ ] All images use `next/image` component
- [ ] Images have `alt` text
- [ ] Images have proper `width` and `height`
- [ ] OG images created (1200x630)
  - `/public/og-image.png`
  - `/public/twitter-image.png`

### Fonts

- [ ] Use `next/font` for Google Fonts (self-hosted)
- [ ] Add `font-display: swap` to avoid FOIT
- [ ] Preload critical fonts

### JavaScript

- [ ] Remove `console.log` statements
- [ ] Remove unused dependencies
- [ ] Use dynamic imports for heavy components
- [ ] Enable React strict mode

### CSS

- [ ] Remove unused Tailwind classes
- [ ] Inline critical CSS
- [ ] Defer non-critical CSS

### Monitoring

- [ ] Add `robots.txt` file ✅ (implied in metadata)
- [ ] Add `sitemap.xml`
- [ ] Set up Google Analytics (optional)
- [ ] Set up Google Search Console

## Running Audits for Both Landing Pages

### Desktop Audit

```bash
# Start server
yarn build && yarn start

# In another terminal, run audits
lhci autorun --url http://localhost:3000 --preset desktop
lhci autorun --url http://localhost:3000/enterprise --preset desktop
```

### Mobile Audit

```bash
lhci autorun --url http://localhost:3000 --preset mobile
lhci autorun --url http://localhost:3000/enterprise --preset mobile
```

## Interpreting Results

### Performance Metrics

- **First Contentful Paint (FCP):** < 1.8s (good)
- **Largest Contentful Paint (LCP):** < 2.5s (good)
- **Total Blocking Time (TBT):** < 200ms (good)
- **Cumulative Layout Shift (CLS):** < 0.1 (good)
- **Speed Index:** < 3.4s (good)

### Accessibility Score Breakdown

- **90-100:** Excellent accessibility
- **50-89:** Some improvements needed
- **0-49:** Critical accessibility issues

### SEO Checklist

- [x] Document has a `<title>` tag
- [x] Document has a meta description
- [x] Page has successful HTTP status code
- [x] Links are crawlable
- [x] Document uses legible font sizes
- [x] Tap targets are appropriately sized
- [ ] Document has a valid `hreflang` (if multilingual)
- [ ] Structured data is valid (if present)

## Next Steps After Audit

1. **Document baseline scores** in STATUS.md
2. **Prioritize fixes** by impact (high score improvements first)
3. **Implement fixes** in order of priority
4. **Re-run audits** to verify improvements
5. **Set up CI/CD integration** to run Lighthouse on every PR

## Useful Tools

- **Chrome DevTools:** Built-in Lighthouse
- **PageSpeed Insights:** https://pagespeed.web.dev/
- **WebPageTest:** https://www.webpagetest.org/
- **Lighthouse CI:** https://github.com/GoogleChrome/lighthouse-ci
- **Bundle Analyzer:** `@next/bundle-analyzer`

## Notes

- Lighthouse scores can vary by 5-10 points due to network conditions
- Run audits 3 times and take the average
- Test on both Desktop and Mobile
- Production builds perform better than development builds
- Edge deployment (Vercel) will have different scores than localhost
