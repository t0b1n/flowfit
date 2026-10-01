import { chromium } from 'playwright-core'; import fs from 'fs';
const [url, out, w = 1300, h = 957] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } }); p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://localhost:8765/' + url); await p.waitForFunction('window.__done', null, { timeout: 180000 });
console.log(JSON.stringify(await p.evaluate('window.__res'))); await p.screenshot({ path: out }); await b.close();
