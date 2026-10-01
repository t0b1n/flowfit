import { chromium } from 'playwright-core';
const [page, out, w = 1600, h = 1000] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:8765/${page}`); await p.waitForFunction('window.__done', null, { timeout: 180000 });
await p.screenshot({ path: out }); console.log('ok', out); await b.close();
