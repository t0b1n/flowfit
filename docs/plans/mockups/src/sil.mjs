import { chromium } from 'playwright-core'; import fs from 'fs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }); const p = await b.newPage();
await p.goto('http://localhost:8765/sil.html'); await p.waitForFunction('window.__done');
fs.writeFileSync('sil.json', JSON.stringify(await p.evaluate('window.__sil'))); await b.close();
