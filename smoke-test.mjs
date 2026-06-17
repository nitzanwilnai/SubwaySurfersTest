import puppeteer from 'puppeteer';

const URL = process.env.URL || 'http://localhost:4173/';
const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
  ],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 600 });

  page.on('console', (msg) => {
    const t = msg.type();
    logs.push(`[${t}] ${msg.text()}`);
    if (t === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));
  page.on('requestfailed', (req) => logs.push(`[reqfail] ${req.url()} ${req.failure()?.errorText}`));
  page.on('response', (res) => {
    if (res.status() >= 400) logs.push(`[http ${res.status()}] ${res.url()}`);
  });

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Wait for the game object + WebGL context.
  await page.waitForFunction('window.__game && window.__game.renderer', { timeout: 15000 });

  const ctxType = await page.evaluate(() => {
    const gl = window.__game.renderer.getContext();
    return gl && gl.constructor ? gl.constructor.name : 'none';
  });
  console.log('WebGL context:', ctxType);

  // Start the game.
  await page.click('#play-btn');
  await new Promise((r) => setTimeout(r, 400));

  let state = await page.evaluate(() => window.__game.state);
  console.log('State after Play:', state);

  // Simulate several seconds of play with random inputs.
  const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  const start = Date.now();
  while (Date.now() - start < 6000) {
    const k = keys[(Math.random() * keys.length) | 0];
    await page.keyboard.press(k);
    await new Promise((r) => setTimeout(r, 120));
    const dead = await page.evaluate(() => window.__game.state === 'over');
    if (dead) break;
  }

  const snapshot = await page.evaluate(() => ({
    state: window.__game.state,
    score: window.__game.world.getScore(),
    coins: window.__game.coins,
    speed: Number(window.__game.world.speed.toFixed(1)),
    obstacles: window.__game.world.obstacles.length,
    coinsActive: window.__game.world.coins.length,
    distance: Number(window.__game.world.distance.toFixed(1)),
  }));
  console.log('Snapshot:', JSON.stringify(snapshot));

  await page.screenshot({ path: 'smoke-screenshot.png' });
  console.log('Screenshot saved.');

  // Verify obstacles/coins are being generated and the world advanced.
  const ok = snapshot.distance > 10 && (snapshot.obstacles > 0 || snapshot.coinsActive > 0);
  console.log('Generation OK:', ok);

  if (errors.length) {
    console.log('\n--- CONSOLE ERRORS ---');
    errors.forEach((e) => console.log(e));
    console.log('\n--- RELATED LOGS ---');
    logs.filter((l) => l.includes('http ') || l.includes('reqfail')).forEach((l) => console.log(l));
  }

  await browser.close();
  if (errors.length) {
    console.error(`\nFAIL: ${errors.length} console error(s).`);
    process.exit(1);
  }
  if (!ok) {
    console.error('\nFAIL: world did not generate content / advance.');
    process.exit(1);
  }
  console.log('\nPASS: game booted, rendered, and ran without errors.');
} catch (e) {
  console.error('TEST ERROR:', e.message);
  logs.slice(-20).forEach((l) => console.log(l));
  await browser.close();
  process.exit(1);
}
