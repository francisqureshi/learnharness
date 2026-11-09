// Read-only browser checks against an isolated server. No provider calls.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin=process.argv[2];
if(!origin || !['localhost','127.0.0.1'].includes(new URL(origin).hostname)) throw Error('Use an isolated loopback backend');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH ?? '/run/current-system/sw/bin/chromium',headless:true});
const pause=()=>new Promise(r=>setTimeout(r,100));
async function expectMode(page,mode){
 const expected=mode==='light'?'#f2f1ef':'#141414';
 for(let i=0;i<60;i++){
  const state=await page.evaluate(()=>({dark:document.documentElement.classList.contains('dark'),bg:getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),scheme:getComputedStyle(document.documentElement).colorScheme}));
  if(state.dark===(mode==='dark')&&state.bg===expected&&state.scheme===mode)return;
  await pause();
 }
 throw Error(`Appearance did not become ${mode}`);
}
try{
 const phone=await browser.newPage();const desktop=await browser.newPage();
 phone.setDefaultTimeout(10000);desktop.setDefaultTimeout(10000);
 await phone.setViewport({width:402,height:874,isMobile:true,hasTouch:true});
 await desktop.setViewport({width:1280,height:900});
 let writes=0;
 for(const page of [phone,desktop])page.on('request',r=>{if(r.method()==='PUT'&&r.url().includes('/api/settings'))writes++;});
 await phone.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);
 await desktop.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
 await Promise.all([phone.goto(`${origin}/chat/new`),desktop.goto(`${origin}/chat/new`)]);
 await phone.waitForSelector('html.lh-phone');
 await expectMode(phone,'light');await expectMode(desktop,'dark');
 await phone.bringToFront();
 await phone.click('[aria-label="Open sidebar"]');
 for(let i=0;i<30 && await phone.$eval('aside',e=>e.getBoundingClientRect().width)<288;i++) await pause();
 await phone.waitForSelector('[data-testid="settings-entry"]',{visible:true});
 await phone.click('[data-testid="settings-entry"]');
 await phone.waitForSelector('[data-testid="settings-nav-appearance"]');
 await phone.click('[data-testid="settings-nav-appearance"]');
 await phone.waitForSelector('[data-testid="row-mode"]',{visible:true});
 assert.ok((await phone.$eval('[data-testid="row-mode"]',e=>e.textContent)).includes('Automatic'));
 assert.equal(await phone.$('[data-testid="select-mode"]'),null);
 assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth),402);
 await phone.screenshot({path:'/tmp/lh-pearl-mobile.png'});
 await phone.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);await expectMode(phone,'dark');
 await desktop.bringToFront();await desktop.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await expectMode(desktop,'light');
 await expectMode(phone,'dark');
 await desktop.screenshot({path:'/tmp/lh-pearl-desktop.png'});
 await phone.bringToFront();await phone.emulateMediaFeatures([{name:'prefers-color-scheme',value:'light'}]);await expectMode(phone,'light');
 await phone.reload();await phone.waitForSelector('html.lh-phone');await expectMode(phone,'light');
 assert.equal(writes,0,'OS appearance changes must never write shared settings');
 console.log('PASS: initial Pearl/dark, live switching both ways, independent devices, reload, automatic settings UI, no overflow or settings writes');
}finally{await browser.close();}
