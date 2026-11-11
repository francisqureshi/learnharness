// Run only against an isolated server: this checks saving then restoring one
// graph setting. No provider calls, sign-in, credentials or chats are created.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin = process.argv[2];
if (!origin) throw new Error('Pass an isolated server URL (this test writes a setting).');
const browser = await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/run/current-system/sw/bin/chromium',headless:true});
try {
 const page=await browser.newPage();
 await page.setViewport({width:402,height:874,isMobile:true,hasTouch:true});
 const openSettings=async()=>{
  await page.click('[aria-label="Open sidebar"]');
  await page.waitForFunction(()=>document.querySelector('aside').getBoundingClientRect().width===288);
  await page.click('[data-testid="settings-entry"]');
  await page.waitForSelector('[data-testid="settings-dialog"]');
 };
 await page.goto(origin);await page.waitForSelector('html.lh-phone');await openSettings();
 assert.equal(await page.$eval('[data-testid="settings-content"]',e=>e.hidden),true);
 assert.equal(await page.$eval('.lh-app-shell',e=>e.inert),true);
 for(const section of ['keys','agent','appearance','graph','keyboard','general']) {
  await page.click(`[data-testid="settings-nav-${section}"]`);
  await page.waitForSelector(`[data-testid="section-${section}"]`,{visible:true});
  assert.equal(await page.$eval('[data-testid="settings-nav"]',e=>e.hidden),true);
  const box=await page.$eval('[data-testid="settings-content"]',e=>({width:e.clientWidth,scrollWidth:e.scrollWidth}));
  assert.equal(box.width,402);assert.equal(box.scrollWidth,box.width,`${section} must not overflow horizontally`);
  await page.click('[aria-label="Back to settings"]');
 }
 await page.click('[data-testid="settings-nav-graph"]');
 const toggle='[data-testid="toggle-graph-rendering-enabled"]';
 await page.waitForSelector(toggle);
 const before=await page.$eval(toggle,e=>e.getAttribute('aria-checked'));
 const knob=await page.$eval(toggle,e=>({track:e.getBoundingClientRect().toJSON(),knob:e.querySelector('span').getBoundingClientRect().toJSON()}));
 assert.ok(knob.track.height>=44);assert.ok(knob.knob.left>=knob.track.left&&knob.knob.right<=knob.track.right,'Switch knob must fit track');
 try {
  const saved=page.waitForResponse(r=>r.url().endsWith('/api/settings/graph')&&r.request().method()==='PUT');
  await page.click(toggle);assert.equal((await saved).status(),200);
  await page.waitForFunction((selector,old)=>document.querySelector(selector).getAttribute('aria-checked')!==old,{},toggle,before);
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('[data-testid="settings-content"]',e=>e.hidden),true);
  await page.click('[aria-label="Close settings"]');
  assert.equal(await page.$eval('.lh-app-shell',e=>e.inert),false);
  await openSettings();await page.click('[data-testid="settings-nav-graph"]');await page.waitForSelector(toggle);
  assert.notEqual(await page.$eval(toggle,e=>e.getAttribute('aria-checked')),before,'Saved value survives closing settings');
 } finally {
  if(await page.$(toggle)) {
   if(await page.$eval(toggle,e=>e.getAttribute('aria-checked'))!==before) {
    const restored=page.waitForResponse(r=>r.url().endsWith('/api/settings/graph')&&r.request().method()==='PUT');
    await page.click(toggle);assert.equal((await restored).status(),200);
   }
  }
 }
 const desktop=await browser.newPage();await desktop.setViewport({width:1280,height:900});await desktop.goto(origin);
 await desktop.waitForSelector('[data-testid="settings-entry"]');await desktop.click('[data-testid="settings-entry"]');
 await desktop.waitForSelector('[data-testid="settings-dialog"]');
 await desktop.waitForFunction(()=>Math.abs(document.querySelector('[data-testid="settings-nav"]').getBoundingClientRect().width-176)<0.1);
 assert.equal(await desktop.$eval('[data-testid="settings-nav"]',e=>e.hidden),false);
 assert.equal(await desktop.$('.lh-settings-phone-header'),null);
 console.log('PASS: six mobile categories, navigation, no overflow, touch targets, switch bounds, persistence/restore and desktop layout');
} finally { await browser.close(); }
