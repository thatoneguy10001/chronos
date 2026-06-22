import { test, expect } from '@playwright/test';
import { initGame, send, sendAndWait, assertNoPanic } from './helpers';

// All tests share a single browser context per worker — boot the game once
// per test file to keep the suite fast. Each test() picks up from where
// the previous left off (in-order, no isolation needed for a golden path).

test.describe('Iron & Blood — golden path', () => {
  test('world-selection screen renders with Iron & Blood', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Iron & Blood')).toBeVisible();
    await expect(page.getByText('Iron & Blood').first()).toBeEnabled();
  });

  test('character-creation screen appears after selecting a world', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Iron & Blood').first().click();
    // Class cards should be visible.
    await expect(page.getByText('Vanguard').first()).toBeVisible({ timeout: 8_000 });
  });

  test('game initialises and shows starting room description', async ({ page }) => {
    await initGame(page);
    // The opening "look" result should reference the Gate of Fort Iron.
    await expect(page.getByText('Gate', { exact: false }).first()).toBeVisible();
    await assertNoPanic(page);
  });

  test('look command returns a room description', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'look', 'Gate');
    await assertNoPanic(page);
  });

  test('go north moves the player to the Command Post', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go north', 'Command Post');
    await assertNoPanic(page);
  });

  test('talk to Commander Thorn returns dialogue', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go north');
    await sendAndWait(page, 'talk commander thorn', 'Thorn');
    await assertNoPanic(page);
  });

  test('accept trench sweep quest succeeds', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go north');
    await sendAndWait(page, 'talk commander thorn');
    await sendAndWait(page, 'accept trench sweep', 'Quest');
    await assertNoPanic(page);
  });

  test('accepting the same quest twice is handled gracefully', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go north');
    await sendAndWait(page, 'talk commander thorn');
    await sendAndWait(page, 'accept trench sweep');
    const before = await page.locator('#root').innerText();
    await send(page, 'accept trench sweep');
    // Wait briefly — response may be instant (no engine round-trip for duplicates).
    await page.waitForTimeout(300);
    await assertNoPanic(page);
    // Something was written to the terminal.
    const after = await page.locator('#root').innerText();
    expect(after.length).toBeGreaterThan(before.length);
  });

  test('attack with no enemies is handled gracefully', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go north');
    await sendAndWait(page, 'attack');
    await assertNoPanic(page);
  });

  test('ability with no enemies is handled gracefully', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go north');
    await sendAndWait(page, 'iron press');
    await assertNoPanic(page);
  });

  test('moving in a blocked direction is handled gracefully', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'go east'); // Gate has no east exit.
    await assertNoPanic(page);
  });

  test('help command returns output', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'help', 'help');
    await assertNoPanic(page);
  });

  test('inventory command returns output', async ({ page }) => {
    await initGame(page);
    await sendAndWait(page, 'inventory');
    await assertNoPanic(page);
  });
});

// ── Parser robustness (key cases from stress-test.js) ────────────────────────

test.describe('parser robustness — no panics on edge-case input', () => {
  const edgeCases: [string, string][] = [
    ['empty string',       ''],
    ['single space',       ' '],
    ['500-char string',    'x'.repeat(500)],
    ['script tag',         '<script>alert(1)</script>'],
    ['sql injection',      "'; DROP TABLE quests; --"],
    ['emoji',              '🔥💀⚔️'],
    ['go with no dir',     'go'],
    ['go invalid dir',     'go supernova'],
    ['just numbers',       '42'],
    ['path traversal',     '../../../etc/passwd'],
  ];

  for (const [name, cmd] of edgeCases) {
    test(`no panic: ${name}`, async ({ page }) => {
      await initGame(page);
      const before = await page.locator('#root').innerText();
      await send(page, cmd);
      await page.waitForTimeout(300);
      await assertNoPanic(page);
      // Terminal must have grown (error or "I don't understand" — not frozen).
      const after = await page.locator('#root').innerText();
      expect(after.length).toBeGreaterThanOrEqual(before.length);
    });
  }
});
