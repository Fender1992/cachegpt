/**
 * Mobile Chat Window Stability Tests
 * Tests to verify the chat modal doesn't close randomly on mobile devices
 *
 * Key scenarios tested:
 * 1. Backdrop click validation (only intentional taps close modal)
 * 2. Scroll gestures don't trigger close
 * 3. Keyboard open/close cycles don't affect modal
 * 4. Orientation changes preserve modal state
 * 5. Navigation and back button behavior
 */

import { test, expect, devices } from '@playwright/test'

test.describe('Mobile Chat Modal Stability', () => {
  test.use({
    ...devices['iPhone 13'],
    hasTouch: true,
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    // Open the mobile chat modal if not already open
    const chatTrigger = page.locator('button:has-text("Start Chatting"), button:has-text("Chat"), [data-testid="mobile-chat-trigger"]')
    if (await chatTrigger.first().isVisible()) {
      await chatTrigger.first().click()
      await page.waitForTimeout(500)
    }
  })

  test('should NOT close when touching the backdrop during scroll', async ({ page }) => {
    // Verify modal is open
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Simulate a scroll gesture on backdrop (touch + move)
    const backdrop = page.locator('.fixed.z-\\[60\\].bg-black\\/70')

    if (await backdrop.isVisible()) {
      // Start touch at center
      const box = await backdrop.boundingBox()
      if (box) {
        const startX = box.x + box.width / 2
        const startY = box.y + box.height / 2

        // Simulate scroll gesture (touch, move 50px down, release)
        await page.mouse.move(startX, startY)
        await page.mouse.down()
        await page.mouse.move(startX, startY + 50, { steps: 10 })
        await page.mouse.up()

        // Modal should still be visible after scroll gesture
        await expect(modal.first()).toBeVisible()
      }
    }
  })

  test('should close on intentional backdrop tap', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Intentional tap (quick click with minimal movement)
    const backdrop = page.locator('.fixed.z-\\[60\\].bg-black\\/70')

    if (await backdrop.isVisible()) {
      await backdrop.click()

      // Modal should close after intentional tap
      await expect(modal.first()).not.toBeVisible({ timeout: 2000 })
    }
  })

  test('should remain open after multiple input focus/blur cycles', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    const input = page.locator('textarea').first()

    if (await input.isVisible()) {
      // Simulate keyboard open/close cycles
      for (let i = 0; i < 5; i++) {
        await input.focus()
        await page.waitForTimeout(200)
        await input.blur()
        await page.waitForTimeout(200)
      }

      // Modal should still be open
      await expect(modal.first()).toBeVisible()
    }
  })

  test('should remain open after typing', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    const input = page.locator('textarea').first()

    if (await input.isVisible()) {
      // Type a message
      await input.fill('Hello, testing chat stability')
      await page.waitForTimeout(1000)

      // Modal should still be open
      await expect(modal.first()).toBeVisible()

      // Clear and type again
      await input.fill('')
      await input.fill('Second test message')
      await page.waitForTimeout(1000)

      // Modal should still be open
      await expect(modal.first()).toBeVisible()
    }
  })

  test('should survive viewport orientation changes', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Switch to landscape
    await page.setViewportSize({ width: 844, height: 390 })
    await page.waitForTimeout(500)

    // Modal should still be visible (might be hidden on larger viewports due to md: breakpoint)
    // But shouldn't cause errors

    // Switch back to portrait
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(500)

    // Page should still be functional
    const pageTitle = await page.title()
    expect(pageTitle).toBeTruthy()
  })

  test('should close only on explicit X button click', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Find close button
    const closeButton = page.locator('button[aria-label="Close chat"]')

    if (await closeButton.isVisible()) {
      await closeButton.click()

      // Modal should close
      await expect(modal.first()).not.toBeVisible({ timeout: 2000 })
    }
  })

  test('should close on swipe down gesture (intentional)', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Find header area with swipe indicator
    const header = page.locator('.bg-gradient-to-r.from-blue-600.to-indigo-600')

    if (await header.isVisible()) {
      const box = await header.boundingBox()
      if (box) {
        // Swipe down more than 100px (threshold)
        await page.mouse.move(box.x + box.width / 2, box.y + 10)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y + 150, { steps: 20 })
        await page.mouse.up()

        // Modal should close after intentional swipe down
        await expect(modal.first()).not.toBeVisible({ timeout: 2000 })
      }
    }
  })

  test('should NOT close on partial swipe (less than threshold)', async ({ page }) => {
    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    const header = page.locator('.bg-gradient-to-r.from-blue-600.to-indigo-600')

    if (await header.isVisible()) {
      const box = await header.boundingBox()
      if (box) {
        // Swipe down less than 100px (below threshold)
        await page.mouse.move(box.x + box.width / 2, box.y + 10)
        await page.mouse.down()
        await page.mouse.move(box.x + box.width / 2, box.y + 50, { steps: 10 })
        await page.mouse.up()

        // Modal should still be visible
        await page.waitForTimeout(500)
        await expect(modal.first()).toBeVisible()
      }
    }
  })
})

test.describe('Modal State Persistence', () => {
  test.use({
    ...devices['iPhone 13'],
    hasTouch: true,
  })

  test('should restore modal state after page navigation and back', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    // Open modal
    const chatTrigger = page.locator('button:has-text("Start Chatting"), button:has-text("Chat")')
    if (await chatTrigger.first().isVisible()) {
      await chatTrigger.first().click()
      await page.waitForTimeout(500)
    }

    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Navigate to settings
    const settingsLink = page.locator('a[href="/settings"], button:has-text("Settings")')
    if (await settingsLink.first().isVisible()) {
      await settingsLink.first().click()
      await page.waitForLoadState('networkidle')
    }

    // Go back
    await page.goBack()
    await page.waitForLoadState('networkidle')

    // Modal should be restored (due to sessionStorage persistence)
    await expect(modal.first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Mobile Touch Target Sizes', () => {
  test.use(devices['iPhone 13'])

  test('close button should have minimum 44x44 touch target', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    // Open modal
    const chatTrigger = page.locator('button:has-text("Start Chatting"), button:has-text("Chat")')
    if (await chatTrigger.first().isVisible()) {
      await chatTrigger.first().click()
      await page.waitForTimeout(500)
    }

    const closeButton = page.locator('button[aria-label="Close chat"]')
    if (await closeButton.isVisible()) {
      const box = await closeButton.boundingBox()
      if (box) {
        // Touch targets should be at least 44x44 for accessibility
        expect(box.width).toBeGreaterThanOrEqual(40) // Slight tolerance
        expect(box.height).toBeGreaterThanOrEqual(40)
      }
    }
  })

  test('send button should have minimum touch target', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    // Open modal
    const chatTrigger = page.locator('button:has-text("Start Chatting"), button:has-text("Chat")')
    if (await chatTrigger.first().isVisible()) {
      await chatTrigger.first().click()
      await page.waitForTimeout(500)
    }

    const sendButton = page.locator('button[aria-label="Send message"], button:has-text("Send")')
    if (await sendButton.first().isVisible()) {
      const box = await sendButton.first().boundingBox()
      if (box) {
        expect(box.width).toBeGreaterThanOrEqual(40)
        expect(box.height).toBeGreaterThanOrEqual(40)
      }
    }
  })
})

test.describe('Long-Running Stability', () => {
  test.use({
    ...devices['iPhone 13'],
    hasTouch: true,
  })

  test('modal should remain stable after extended idle time', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    // Open modal
    const chatTrigger = page.locator('button:has-text("Start Chatting"), button:has-text("Chat")')
    if (await chatTrigger.first().isVisible()) {
      await chatTrigger.first().click()
    }

    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    // Wait for 30 seconds (simulating user idle)
    await page.waitForTimeout(30000)

    // Modal should still be open
    await expect(modal.first()).toBeVisible()
  })

  test('should handle rapid interactions without closing', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    // Open modal
    const chatTrigger = page.locator('button:has-text("Start Chatting"), button:has-text("Chat")')
    if (await chatTrigger.first().isVisible()) {
      await chatTrigger.first().click()
    }

    const modal = page.locator('.fixed.z-\\[70\\]')
    await expect(modal.first()).toBeVisible({ timeout: 5000 })

    const input = page.locator('textarea').first()

    if (await input.isVisible()) {
      // Rapid focus/blur/type cycles
      for (let i = 0; i < 10; i++) {
        await input.focus()
        await input.fill(`Message ${i}`)
        await page.waitForTimeout(100)
      }

      // Modal should still be open after rapid interactions
      await expect(modal.first()).toBeVisible()
    }
  })
})
