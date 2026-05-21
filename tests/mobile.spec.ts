import { test, expect } from '@playwright/test';

/**
 * Mobile-viewport regression checks for the primary LoopTV flow.
 * Runs under every project; meaningful under `--project=mobile` (iPhone 13,
 * 390px wide — the Wave 1 mobile target).
 */

test.describe('LoopTV mobile primary flow', () => {
  test('landing has no horizontal scroll and reachable CTAs', async ({ page }) => {
    await page.goto('/');

    // No horizontal scroll: scroll width must not exceed the viewport width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // The four hero CTAs must all be visible (they wrap, never overflow).
    for (const label of ['Play All', 'Shuffle', 'Smart Mix', 'Build Station']) {
      await expect(page.getByRole('button', { name: label })).toBeVisible();
    }
  });

  test('player controls stay within the viewport when playing', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Play All' }).click();

    // Give the player shell a moment to mount.
    await page.waitForTimeout(1500);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
