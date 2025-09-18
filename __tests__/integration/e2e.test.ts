import { test, expect } from '@playwright/test'

test.describe('CacheGPT E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000')
  })

  test('homepage loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/CacheGPT/)
    await expect(page.locator('h1')).toContainText('Intelligent LLM Caching')
    await expect(page.locator('.btn-glow')).toBeVisible()
  })

  test('authentication flow', async ({ page }) => {
    // Click sign in button
    await page.click('text=Sign In')

    // Fill in credentials
    await page.fill('input[type="email"]', 'test@example.com')
    await page.fill('input[type="password"]', 'testpassword')

    // Submit form
    await page.click('button[type="submit"]')

    // Should redirect to dashboard
    await expect(page).toHaveURL(/.*dashboard/)
    await expect(page.locator('text=Dashboard')).toBeVisible()
  })

  test('API key generation', async ({ page }) => {
    // Assume logged in
    await page.goto('http://localhost:3000/dashboard')

    // Click create API key
    await page.click('text=Create New Key')

    // Fill in key name
    await page.fill('input[placeholder="Key name"]', 'Test Key')

    // Create key
    await page.click('text=Generate Key')

    // Should show new key
    await expect(page.locator('text=cgpt_')).toBeVisible()

    // Copy key
    await page.click('button[aria-label="Copy key"]')

    // Should show success message
    await expect(page.locator('text=Copied!')).toBeVisible()
  })

  test('chat interface', async ({ page }) => {
    // Navigate to chat
    await page.goto('http://localhost:3000/chat')

    // Type message
    await page.fill('textarea[placeholder="Type your message..."]', 'What is machine learning?')

    // Send message
    await page.keyboard.press('Enter')

    // Should show response
    await expect(page.locator('.chat-message')).toBeVisible()

    // Check for cache indicator
    const cacheIndicator = page.locator('.cache-badge')
    if (await cacheIndicator.isVisible()) {
      await expect(cacheIndicator).toContainText(/Cached/)
    }
  })

  test('documentation navigation', async ({ page }) => {
    await page.goto('http://localhost:3000/docs')

    // Check sidebar navigation
    await expect(page.locator('.docs-sidebar')).toBeVisible()

    // Navigate to API Reference
    await page.click('text=API Reference')
    await expect(page.locator('h2')).toContainText('API Reference')

    // Navigate to Quick Start
    await page.click('text=Quick Start')
    await expect(page.locator('h2')).toContainText('Quick Start')
  })

  test('status page monitoring', async ({ page }) => {
    await page.goto('http://localhost:3000/status')

    // Check overall status
    await expect(page.locator('text=/All Systems Operational|Partial System Degradation|Major Outage/')).toBeVisible()

    // Check service statuses
    await expect(page.locator('text=API Gateway')).toBeVisible()
    await expect(page.locator('text=Database')).toBeVisible()
    await expect(page.locator('text=Cache Service')).toBeVisible()

    // Check metrics
    await expect(page.locator('text=API Requests')).toBeVisible()
    await expect(page.locator('text=Cache Hit Rate')).toBeVisible()
  })

  test('usage tracking dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard')

    // Check usage stats
    await expect(page.locator('text=Daily Requests')).toBeVisible()
    await expect(page.locator('text=Cache Hit Rate')).toBeVisible()
    await expect(page.locator('text=Tokens Used')).toBeVisible()
    await expect(page.locator('text=Monthly Cost')).toBeVisible()

    // Check progress bars
    const progressBars = page.locator('[role="progressbar"]')
    await expect(progressBars).toHaveCount(2) // Daily and monthly
  })

  test('mobile responsiveness', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 })

    await page.goto('http://localhost:3000')

    // Check mobile menu
    await page.click('[aria-label="Menu"]')
    await expect(page.locator('.mobile-menu')).toBeVisible()

    // Navigate on mobile
    await page.click('text=Docs')
    await expect(page).toHaveURL(/.*docs/)
  })

  test('dark mode toggle', async ({ page }) => {
    await page.goto('http://localhost:3000')

    // Toggle dark mode
    await page.click('[aria-label="Toggle dark mode"]')

    // Check dark mode is applied
    await expect(page.locator('html')).toHaveClass(/dark/)

    // Toggle back
    await page.click('[aria-label="Toggle dark mode"]')
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  })

  test('performance monitoring', async ({ page }) => {
    // Enable performance monitoring
    await page.coverage.startCSSCoverage()
    await page.coverage.startJSCoverage()

    await page.goto('http://localhost:3000')

    // Navigate through key pages
    await page.click('text=Docs')
    await page.click('text=Pricing')
    await page.click('text=Status')

    // Get coverage
    const jsCoverage = await page.coverage.stopJSCoverage()
    const cssCoverage = await page.coverage.stopCSSCoverage()

    // Check that we're not loading too much unused code
    const totalJSBytes = jsCoverage.reduce((total, entry) => total + entry.text.length, 0)
    const usedJSBytes = jsCoverage.reduce((total, entry) => {
      return total + entry.ranges.reduce((sum, range) => sum + (range.end - range.start), 0)
    }, 0)

    const jsUsagePercent = (usedJSBytes / totalJSBytes) * 100
    expect(jsUsagePercent).toBeGreaterThan(30) // At least 30% of JS should be used
  })
})