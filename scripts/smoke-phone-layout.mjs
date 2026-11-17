// Run against an isolated server with CHROME_PATH pointing to Chromium.
// No chats are submitted and no provider calls are made.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin = process.argv[2] ?? 'http://127.0.0.1:3122';
const browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH ?? '/run/current-system/sw/bin/chromium', headless: true});
try {
  const page = await browser.newPage();
  await page.setViewport({width:430,height:932,isMobile:true,hasTouch:true});
  await page.evaluateOnNewDocument(() => localStorage.setItem('lh:sidebar-open','1'));
  await page.goto(origin);
  await page.waitForSelector('html.lh-phone');
  await page.waitForSelector('[data-testid="phone-header"]');
  assert.equal(await page.$eval('[data-testid="stats-bar"]', el => el.getBoundingClientRect().height), 0, 'Model controls belong in closed options');
  await page.click('[aria-label="Lesson options"]');
  assert.ok(await page.$eval('[data-testid="stats-bar"]', el => el.getBoundingClientRect().height) > 0);
  await page.click('[aria-label="Close options"]');
  assert.ok(await page.$('[data-testid="composer"] .lh-phone-dictation [data-testid="dictation-toggle"]'), 'Dictation belongs inside composer');
  const frame = () => page.evaluate(() => ({
    sidebar: document.querySelector('aside').getBoundingClientRect().width,
    main: document.querySelector('main').getBoundingClientRect().width,
    inactive: document.querySelector('main').inert,
    typing: document.activeElement.matches('input,textarea,[contenteditable="true"]'),
    preference: localStorage.getItem('lh:sidebar-open'),
  }));
  assert.equal((await frame()).sidebar,0);
  assert.equal((await frame()).typing,false);
  assert.equal((await frame()).main,430);
  await page.click('[aria-label="Open sidebar"]');
  await page.waitForSelector('[aria-modal="true"]');
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 288);
  assert.equal((await frame()).main,430,'Drawer must overlay, not squeeze the lesson');
  assert.equal((await frame()).inactive,true);
  assert.equal((await frame()).typing,false,'Opening navigation must not open keyboard');
  await page.keyboard.press('Escape');
  await page.waitForSelector('[aria-modal="true"]',{hidden:true});
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 0);
  assert.equal((await frame()).inactive,false);
  await page.click('[aria-label="Open sidebar"]');
  await page.waitForSelector('[aria-modal="true"]');
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 288);
  await page.mouse.click(410,400);
  await page.waitForSelector('[aria-modal="true"]',{hidden:true});
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 0);
  await page.click('[aria-label="Open sidebar"]');
  await page.waitForSelector('[aria-modal="true"]');
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 288);
  await page.click('[data-testid="new-session-practice"]');
  await page.waitForFunction(() => location.pathname==='/chat/new');
  await page.waitForSelector('[aria-modal="true"]',{hidden:true});
  await page.waitForFunction(() => document.querySelector('aside').getBoundingClientRect().width === 0);
  assert.equal((await frame()).typing,false,'Navigation must not autofocus the composer');
  await page.click('[contenteditable="true"]');
  assert.equal((await frame()).typing,true,'Explicit input tap still focuses');
  await page.reload();
  await page.waitForSelector('html.lh-phone');
  assert.equal((await frame()).typing,false);
  assert.equal((await frame()).sidebar,0);
  assert.equal((await frame()).preference,'1','Phone must preserve desktop preference');
  await page.setViewport({width:932,height:430,isMobile:true,hasTouch:true});
  await page.waitForFunction(() => document.querySelector('main').getBoundingClientRect().width===932);
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('lh-phone')),true);
  const desktop=await browser.newPage();
  await desktop.setViewport({width:1280,height:900});
  await desktop.goto(origin);
  await desktop.waitForFunction(()=>document.querySelector('aside')?.getBoundingClientRect().width===288);
  assert.equal(await desktop.evaluate(()=>document.documentElement.classList.contains('lh-phone')),false);
  assert.equal(await desktop.evaluate(()=>document.querySelector('main').getBoundingClientRect().width),992);
  const electron=await browser.newPage();
  await electron.setUserAgent(`${await browser.userAgent()} Electron/44.9.3`);
  await electron.setViewport({width:600,height:800});
  await electron.goto(origin);
  await electron.waitForSelector('html.lh-electron');
  assert.equal(await electron.evaluate(()=>document.documentElement.classList.contains('lh-phone')),false);
  console.log('PASS: phone drawer, focus, navigation, reload, landscape, desktop and Electron layout');
} finally { await browser.close(); }
