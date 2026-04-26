const puppeteer = require('puppeteer');

(async () => {
  const BASE = 'http://localhost:3000';
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.toString()));
  page.on('requestfailed', req => console.log('REQUEST FAILED:', req.url(), req.failure && req.failure().errorText));

  try {
    console.log('Opening app...');
    await page.goto(BASE, { waitUntil: 'networkidle2' });

    // Wait for container and dashboard content
    await page.waitForSelector('#app-container');
    await page.waitForFunction(() => document.getElementById('app-container').innerText.length > 0, { timeout: 3000 });
    console.log('Initial content loaded');

    // Helper to click nav link by text
    async function clickNavByIndex(index, pageId, expectedSelector) {
      console.log(`Clicking nav index ${index}...`);
      const selector = `.nav-links a:nth-child(${index})`;
      await page.waitForSelector(selector);
      // Try a direct call to the page's handler to ensure we trigger showPage reliably
      await page.evaluate((idx, pid) => {
        const el = document.querySelector(`.nav-links a:nth-child(${idx})`);
        if (typeof handleNavClick === 'function') {
          handleNavClick(null, pid, el);
        } else {
          // fallback to clicking
          el && el.click();
        }
      }, index, pageId);
      try {
        await page.waitForFunction((sel) => !!document.querySelector('#app-container ' + sel), { timeout: 5000 }, expectedSelector);
        console.log(`Nav index ${index} page loaded`);
      } catch (err) {
        const html = await page.$eval('#app-container', el => el.innerHTML);
        console.error(`Nav index ${index} failed to load ${expectedSelector}. Current app-container HTML:\n`, html.slice(0,1000));
        try { await page.screenshot({ path: `ui-nav-fail-${index}.png` }); } catch(e){}
        throw err;
      }
    }

    // Dashboard already loaded; verify key text
    const dashText = await page.$eval('#app-container', el => el.innerText);
    console.log('Dashboard snippet:', dashText.slice(0, 120).replace(/\n/g, ' '));

    // Devices (2), Payments (3), Verification (4)
    await clickNavByIndex(2, 'devices', '#devices');
    await clickNavByIndex(3, 'payments', '#payments');
    await clickNavByIndex(4, 'verification', '#verification');

    console.log('UI navigation test passed');
    await browser.close();
    process.exit(0);
    } catch (err) {
    console.error('UI test failed:', err);
    try { await page.screenshot({ path: 'ui-test-fail.png' }); } catch(e){}
    await browser.close();
    process.exit(2);
  }
})();
