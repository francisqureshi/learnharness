// Pass an isolated preview's URL for a lesson with a pending quiz.
// Only local drafts are edited; no answers or provider requests are submitted.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const url = process.argv[2];
assert.ok(url, 'Usage: node scripts/smoke-phone-answer.mjs <isolated-pending-quiz-url>');
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? '/run/current-system/sw/bin/chromium', headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({width:393, height:520, isMobile:true, hasTouch:true});
  await page.goto(url);
  await page.waitForSelector('[data-testid="question-dock"]');
  const open = async () => {
    await page.evaluate(() => {
      const button = document.querySelector('[data-testid="question-dock-bar"]') ??
        [...document.querySelectorAll('button')].find(el => el.textContent.includes('Check your understanding'));
      button?.click();
    });
    await page.waitForSelector('[data-phone-answer="expanded"]');
    await page.waitForFunction(() => {
      const root = document.querySelector('[data-phone-answer="expanded"]');
      return root && root.getAnimations({subtree:true}).length === 0 &&
        root.querySelector('[data-testid="question-dock"] [data-testid="dictation-toggle"]');
    });
  };
  await open();
  const field = '[data-testid="thinking-field"] [contenteditable]';
  await page.click(field);
  await page.keyboard.type('Preserve this phone draft');
  const draft = await page.$eval(field, el => el.textContent);
  const strip = await page.$('[aria-label="Back to lesson"]');
  assert.ok(strip, 'Expanded question needs a tappable dismissal strip');
  const box = await strip.boundingBox();
  assert.ok(box && box.height >= 40 && box.y >= 56, 'Dismiss strip must be reachable below header');
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('[data-phone-answer="expanded"]', {hidden:true});
  // Trigger the same scroll event used by keyboard/viewport adjustment.
  await page.evaluate(() => document.querySelectorAll('*').forEach(el => {
    if (el.scrollHeight > el.clientHeight) el.dispatchEvent(new Event('scroll'));
  }));
  assert.equal(await page.$('[data-phone-answer="expanded"]'), null, 'Dismissed question must stay closed');
  assert.equal(await page.evaluate(() => !!document.activeElement?.isContentEditable), false);
  await open();
  assert.equal(await page.$eval(field, el => el.textContent), draft, 'Reopening preserves answer');
  const controls = await page.evaluate(() => {
    const root = document.querySelector('[data-testid="question-dock"]');
    const mic = root.querySelector('[data-testid="dictation-toggle"]');
    const send = root.querySelector('[aria-label="Submit answer"]');
    return !!mic && !!send && send.getBoundingClientRect().bottom <= innerHeight &&
      getComputedStyle(send.querySelector('.lh-mobile-submit-icon')).display !== 'none';
  });
  assert.ok(controls, 'Mic and arrow Submit must remain visible inside question bubble');
  console.log('PASS: whitespace dismisses, focus released, stays closed, draft retained, mic/send inside bubble');
} finally {
  await browser.close();
}
