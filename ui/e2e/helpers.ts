import type { Page } from '@playwright/test';

const PANIC_STRINGS = ['panic', 'unwrap()', 'called `Option', 'RUST_BACKTRACE', 'wasm-function'];

/** Select Iron & Blood and a playable class, wait for the game input. */
export async function initGame(page: Page, classPartialName = 'Vanguard') {
  await page.goto('/');
  await page.getByTestId('new-game-iron-and-blood').click();
  await page.getByText(classPartialName).first().click();
  // Wait until the in-game command input is ready (placeholder contains "command").
  await page.locator('input[placeholder*="command"]').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Type a command into the parser input and press Enter. */
export async function send(page: Page, cmd: string) {
  const input = page.locator('input[placeholder*="command"]').first();
  await input.fill(cmd);
  await input.press('Enter');
}

/** Send a command and wait for the engine to respond (tick increments). */
export async function sendAndWait(page: Page, cmd: string, waitForText?: string) {
  // Read the current engine tick from the data attribute on the game frame.
  const frame = page.locator('[data-tick]').first();
  const tickBefore = Number(await frame.getAttribute('data-tick'));
  await send(page, cmd);
  if (waitForText) {
    await page.getByText(waitForText, { exact: false }).first().waitFor({ timeout: 8_000 });
  } else {
    // Wait until the engine has processed the command (tick incremented).
    await page.waitForFunction(
      (prev) => {
        const el = document.querySelector('[data-tick]');
        return el ? Number(el.getAttribute('data-tick')) > prev : false;
      },
      tickBefore,
      { timeout: 8_000 },
    );
  }
}

/** Assert the page contains no panic/WASM error strings. */
export async function assertNoPanic(page: Page) {
  const text = await page.locator('#root').innerText();
  for (const p of PANIC_STRINGS) {
    if (text.toLowerCase().includes(p.toLowerCase())) {
      throw new Error(`Panic string found in output: "${p}"`);
    }
  }
}
