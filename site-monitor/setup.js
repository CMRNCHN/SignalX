const { chromium } = require('playwright');
const fs = require('fs');
const config = require('./config');

async function setup() {
  console.log('🔐 Starting one-time login setup...');
  console.log(`📍 Opening: ${config.url}\n`);

  const browser = await chromium.launch({ headless: false });
  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  try {
    await page.goto(config.url, { waitUntil: 'networkidle' });

    console.log('✅ Browser opened. Please:');
    console.log('1. Log in to the site');
    console.log('2. Solve the hCaptcha');
    console.log('3. Navigate to your filtered search');
    console.log('\n⏳ Press ENTER in this terminal when you\'ve completed login and are viewing your filtered search...\n');

    await new Promise(resolve => process.stdin.once('data', resolve));

    // Save session cookies
    const cookies = await context.cookies();
    const storage = await context.storageState();

    fs.writeFileSync(config.sessionFile, JSON.stringify(storage, null, 2));
    console.log(`✅ Session saved to ${config.sessionFile}`);
    console.log('\n🎉 Setup complete! You can now run: npm start\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

setup();
