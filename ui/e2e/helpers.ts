import type { Page } from '@playwright/test';

const PANIC_STRINGS = ['panic', 'unwrap()', 'called `Option', 'RUST_BACKTRACE', 'wasm-function'];

/** Select Iron & Blood and a playable class, wait for the game terminal. */
export async function initGame(page: Page, classPartialName = 'Vanguard') {
  await page.goto('/');
  await page.getByText('Iron & Blood').first().click();
  await page.getByText(classPartialName).first().click();
  // Wait until the game input is ready.
  await page.getByPlaceholder('enter command...').waitFor({ state: 'visible', timeout: 15_000 });
}

/** Type a command into the parser input and press Enter. */
export async function send(page: Page, cmd: string) {
  const input = page.getByPlaceholder('enter command...');
  await input.fill(cmd);
  await input.press('Enter');
}

/** Send a command and wait for new text to appear in the terminal. */
export async function sendAndWait(page: Page, cmd: string, waitForText?: string) {
  // Measure with textContent (raw DOM) so the waitForFunction comparison uses the same metric.
  const before = await page.locator('#root').evaluate(el => el.textContent?.length ?? 0);
  await send(page, cmd);
  if (waitForText) {
    await page.getByText(waitForText, { exact: false }).first().waitFor({ timeout: 8_000 });
  } else {
    // Wait until the terminal has more text than before.
    await page.waitForFunction(
      (prev) => (document.querySelector('#root')?.textContent?.length ?? 0) > prev,
      before,
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
