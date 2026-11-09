// Run against an isolated loopback backend. Submission requests are intercepted.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const origin = process.argv[2];
if (!origin || !['127.0.0.1','localhost'].includes(new URL(origin).hostname)) throw Error('Use an isolated loopback backend');
const browser = await puppeteer.launch({executablePath: process.env.CHROME_PATH ?? '/run/current-system/sw/bin/chromium',headless:true});
try {
  const page=await browser.newPage();
  await page.setViewport({width:402,height:874,isMobile:true,hasTouch:true});
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148');
  let submissions=0;
  await page.setRequestInterception(true);
  page.on('request', request=>{
    if(request.method()==='POST' && ['/api/chats','/api/chat'].includes(new URL(request.url()).pathname)) {
      submissions++;void request.respond({status:503,contentType:'application/json',body:'{"error":"Test intercepted submission"}'});
    } else void request.continue();
  });
  await page.goto(`${origin}/chat/new`);
  const field='[data-testid="composer"] [contenteditable="true"]';
  await page.waitForSelector(field);
  await page.click(field);await page.keyboard.type('First line');await page.keyboard.press('Enter');await page.keyboard.type('Second line');
  assert.equal(await page.$eval(field,el=>el.textContent),'First line\nSecond line');
  assert.equal(submissions,0,'iOS Return must never submit');
  await page.click('[aria-label="Send"]');
  for(let i=0;i<50 && submissions===0;i++) await new Promise(r=>setTimeout(r,100));
  assert.equal(submissions,1,'The explicit Send button still submits');
  console.log('PASS: iOS Return adds a newline; only tapping Send submits');
} finally { await browser.close(); }
