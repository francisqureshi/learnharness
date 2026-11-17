// Run against an isolated server with no GitHub connection. Stops before GitHub
// registration: no external account, credentials or provider calls are created.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin = process.argv[2];
assert.ok(origin, 'Pass an isolated server origin.');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/run/current-system/sw/bin/chromium', headless: true });
try {
 const page = await browser.newPage();
 await page.setViewport({width:402,height:874,isMobile:true,hasTouch:true});
 await page.goto(origin);
 await page.waitForSelector('html.lh-phone');
 await page.click('[aria-label="Open sidebar"]');
 await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 288);
 await page.click('[data-testid="settings-entry"]');
 await page.waitForSelector('[data-testid="settings-nav-github"]');
 await page.click('[data-testid="settings-nav-github"]');
 await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="github-settings"] button')].some(b => b.textContent === 'Set up GitHub' && !b.disabled));
 const popup = new Promise(resolve => page.once('popup', resolve));
 await page.evaluate(() => [...document.querySelectorAll('[data-testid="github-settings"] button')].find(b => b.textContent === 'Set up GitHub').click());
 const registration = await popup;
 await registration.waitForSelector('form input[name="manifest"]');
 assert.equal(new URL(registration.url()).origin, origin);
 const form = await registration.$eval('form', el => ({ action: el.action, manifest: JSON.parse(el.querySelector('input').value) }));
 assert.equal(new URL(form.action).origin, 'https://github.com');
 assert.equal(form.manifest.public, false);
 assert.deepEqual(form.manifest.default_permissions, {contents:'read',issues:'read',pull_requests:'read',metadata:'read'});
 assert.equal(form.manifest.redirect_url, `${origin}/api/github/setup`);
 assert.deepEqual(form.manifest.callback_urls, [`${origin}/api/github/callback`]);
 assert.equal(form.manifest.hook_attributes.active, false);
 assert.equal(await page.$eval('[data-testid="github-settings"]', el => el.scrollWidth <= el.clientWidth), true);
 console.log('PASS: phone GitHub settings, one-use browser handoff and private read-only registration form; stopped before creating GitHub App');
} finally { await browser.close(); }
