const { chromium } = require('playwright');
const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');
const config = require('./config');

let browser;

async function sendNotification(message) {
  try {
    await axios.post(`https://ntfy.sh/${config.ntfyTopic}`, message, {
      headers: { 'Title': '🔔 Site Monitor Alert' }
    });
    console.log(`✅ Push notification sent: ${message}`);
  } catch (error) {
    console.error('❌ Failed to send notification:', error.message);
  }
}

async function getPageContent() {
  if (!fs.existsSync(config.sessionFile)) {
    console.error('❌ Session not found. Run: npm run setup');
    process.exit(1);
  }

  const storage = JSON.parse(fs.readFileSync(config.sessionFile, 'utf8'));

  if (!browser) {
    browser = await chromium.launch({ headless: true });
  }

  const context = await browser.createBrowserContext({ storageState: storage });
  const page = await context.newPage();

  try {
    await page.goto(config.url, { waitUntil: 'networkidle', timeout: 30000 });
    const content = await page.content();
    await context.close();
    return content;
  } catch (error) {
    await context.close();
    throw error;
  }
}

function extractContent(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);

  // Extract text from the monitored selector
  const element = $(config.contentSelector);
  if (!element.length) {
    console.warn(`⚠️  Selector not found: ${config.contentSelector}`);
    return html; // Fall back to full HTML if selector not found
  }

  return element.html() || element.text();
}

function hashContent(content) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(content).digest('hex');
}

async function check() {
  try {
    console.log(`\n⏱️  Checking at ${new Date().toLocaleTimeString()}...`);

    const html = await getPageContent();
    const content = extractContent(html);
    const currentHash = hashContent(content);

    let previousHash = null;
    if (fs.existsSync(config.stateFile)) {
      const state = JSON.parse(fs.readFileSync(config.stateFile, 'utf8'));
      previousHash = state.hash;
    }

    if (previousHash && currentHash !== previousHash) {
      console.log('🚨 CHANGE DETECTED!');
      await sendNotification(`Updates detected on your filtered search! Check: ${config.url}`);
    } else if (!previousHash) {
      console.log('📝 Initial check - establishing baseline');
    } else {
      console.log('✅ No changes');
    }

    // Save current state
    fs.writeFileSync(config.stateFile, JSON.stringify({
      hash: currentHash,
      lastCheck: new Date().toISOString()
    }, null, 2));

  } catch (error) {
    console.error('❌ Check failed:', error.message);
  }
}

async function start() {
  console.log(`\n🚀 Site Monitor Started`);
  console.log(`📍 URL: ${config.url}`);
  console.log(`🔍 Selector: ${config.contentSelector}`);
  console.log(`📲 Notifications: https://ntfy.sh/${config.ntfyTopic}`);
  console.log(`⏱️  Check interval: ${config.checkInterval} minutes\n`);

  // Run first check immediately
  await check();

  // Schedule recurring checks
  cron.schedule(`*/${config.checkInterval} * * * *`, check);
  console.log(`✅ Monitoring active. Press Ctrl+C to stop.\n`);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n👋 Shutting down...');
  if (browser) await browser.close();
  process.exit(0);
});

start();
