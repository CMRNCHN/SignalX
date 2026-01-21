#!/usr/bin/env node

/**
 * 🤖 Automated Testing Agent for SignalX
 *
 * This script automates the testing steps from SIMPLE_TESTING_STEPS.md
 * It runs TUI tests, GUI tests, accessibility checks, and generates reports.
 */

const { chromium } = require('playwright');
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  projectRoot: path.join(__dirname, '..'),
  tuiBinary: path.join(__dirname, '../src-tauri/target/release/signalx-tui'),
  guiUrl: 'http://localhost:3000',
  testTimeout: 30000, // 30 seconds
  launchTimeout: 120000, // 2 minutes for GUI
};

// Test results storage
const testResults = {
  timestamp: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  }
};

/**
 * Log with timestamp and emoji
 */
function log(message, emoji = '📝') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${emoji} ${timestamp} - ${message}`);
}

/**
 * Record test result
 */
function recordTest(name, status, details = '', error = null) {
  testResults.tests.push({
    name,
    status,
    details,
    error: error?.message || null,
    timestamp: new Date().toISOString()
  });

  testResults.summary.total++;
  testResults.summary[status]++;

  const statusEmoji = {
    passed: '✅',
    failed: '❌',
    skipped: '⏭️'
  }[status] || '❓';

  log(`${name}: ${status.toUpperCase()}`, statusEmoji);
  if (details) log(`  ${details}`);
  if (error) log(`  Error: ${error.message}`, '🚨');
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Test 1: TUI Help Screen
 */
async function testTuiHelp() {
  log('Starting TUI Help Screen test');

  try {
    // Check if TUI binary exists
    if (!fs.existsSync(CONFIG.tuiBinary)) {
      throw new Error(`TUI binary not found at ${CONFIG.tuiBinary}. Run 'tauri build' first.`);
    }

    // Start TUI process
    const tuiProcess = spawn(CONFIG.tuiBinary, [], {
      cwd: CONFIG.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let helpDetected = false;

    // Listen for output
    tuiProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('?') && output.includes('Help')) {
        helpDetected = true;
      }
    });

    tuiProcess.stderr.on('data', (data) => {
      output += data.toString();
    });

    // Wait a bit for startup
    await sleep(2000);

    // Send '?' key to trigger help
    tuiProcess.stdin.write('?');
    await sleep(1000);

    // Send Esc to close help
    tuiProcess.stdin.write('\x1b');
    await sleep(500);

    // Send 'q' to quit
    tuiProcess.stdin.write('q');
    await sleep(500);

    // Kill process if still running
    if (!tuiProcess.killed) {
      tuiProcess.kill();
    }

    // Check results
    if (helpDetected) {
      recordTest('TUI Help Screen', 'passed', 'Help dialog detected in output');
    } else {
      recordTest('TUI Help Screen', 'failed', 'Help dialog not detected', new Error('Help screen not found'));
    }

  } catch (error) {
    recordTest('TUI Help Screen', 'failed', 'Failed to run TUI test', error);
  }
}

/**
 * Test 2: TUI Search
 */
async function testTuiSearch() {
  log('Starting TUI Search test');

  try {
    if (!fs.existsSync(CONFIG.tuiBinary)) {
      throw new Error(`TUI binary not found at ${CONFIG.tuiBinary}`);
    }

    const tuiProcess = spawn(CONFIG.tuiBinary, [], {
      cwd: CONFIG.projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let searchDetected = false;

    tuiProcess.stdout.on('data', (data) => {
      output += data.toString();
      if (output.includes('Search:') || output.includes('search')) {
        searchDetected = true;
      }
    });

    await sleep(2000);

    // Send '/' to start search
    tuiProcess.stdin.write('/');
    await sleep(500);

    // Type search query
    tuiProcess.stdin.write('test');
    await sleep(500);

    // Send Esc to cancel
    tuiProcess.stdin.write('\x1b');
    await sleep(500);

    // Quit
    tuiProcess.stdin.write('q');

    if (!tuiProcess.killed) {
      tuiProcess.kill();
    }

    if (searchDetected) {
      recordTest('TUI Search', 'passed', 'Search functionality detected');
    } else {
      recordTest('TUI Search', 'failed', 'Search not detected', new Error('Search functionality not found'));
    }

  } catch (error) {
    recordTest('TUI Search', 'failed', 'Failed to run search test', error);
  }
}

/**
 * Test 3: GUI Launch
 */
async function testGuiLaunch() {
  log('Starting GUI Launch test');

  try {
    // First start the Vite dev server
    log('Starting Vite dev server...');
    const viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: CONFIG.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Wait for Vite to start (usually takes 5-10 seconds)
    await sleep(8000);

    // Then start Tauri GUI
    log('Starting Tauri GUI...');
    const guiProcess = spawn('npm', ['run', 'tauri:dev'], {
      cwd: CONFIG.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true
    });

    log('GUI process started, waiting for launch...');

    // Wait for GUI to start (up to 2 minutes)
    let guiReady = false;
    let attempts = 0;
    const maxAttempts = 24; // 2 minutes / 5 seconds

    while (!guiReady && attempts < maxAttempts) {
      try {
        // Try to connect to the GUI
        const response = await fetch(CONFIG.guiUrl, { timeout: 5000 });
        if (response.ok) {
          guiReady = true;
          break;
        }
      } catch (error) {
        // GUI not ready yet
      }

      await sleep(5000);
      attempts++;
      log(`Waiting for GUI... (${attempts}/${maxAttempts})`);
    }

    if (guiReady) {
      recordTest('GUI Launch', 'passed', 'SignalX GUI launched successfully');

      // Keep GUI running for next tests
      global.guiProcess = guiProcess;
      global.viteProcess = viteProcess;
      return true;
    } else {
      recordTest('GUI Launch', 'failed', 'GUI failed to launch within timeout');
      guiProcess.kill();
      viteProcess.kill();
      return false;
    }

  } catch (error) {
    recordTest('GUI Launch', 'failed', 'Failed to start GUI', error);
    return false;
  }
}

/**
 * Test 4: Accessibility Tools
 */
async function testAccessibilityTools() {
  log('Starting Accessibility Tools test');

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Navigate to SignalX
    await page.goto(CONFIG.guiUrl, { waitUntil: 'networkidle' });

    // Check if accessibility framework is loaded
    const a11yLoaded = await page.evaluate(() => {
      return typeof window.checkA11y === 'function';
    });

    if (!a11yLoaded) {
      recordTest('Accessibility Tools', 'failed', 'window.checkA11y not available');
      await browser.close();
      return;
    }

    // Run accessibility check
    const results = await page.evaluate(() => {
      return window.checkA11y();
    });

    // Check results
    if (results && results.passed !== undefined) {
      const passed = results.passed;
      const total = results.total || 1;
      const passRate = (passed / total) * 100;

      recordTest('Accessibility Tools', 'passed',
        `Accessibility checks: ${passed}/${total} passed (${passRate.toFixed(1)}%)`);

      // Also test keyboard nav function
      const keyboardNav = await page.evaluate(() => {
        if (typeof window.testKeyboardNav === 'function') {
          return window.testKeyboardNav();
        }
        return null;
      });

      if (keyboardNav) {
        recordTest('Keyboard Navigation Tools', 'passed', 'testKeyboardNav function available');
      }
    } else {
      recordTest('Accessibility Tools', 'failed', 'Invalid accessibility results format');
    }

    await browser.close();

  } catch (error) {
    recordTest('Accessibility Tools', 'failed', 'Failed to run accessibility tests', error);
  }
}

/**
 * Test 5: Keyboard Navigation
 */
async function testKeyboardNavigation() {
  log('Starting Keyboard Navigation test');

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(CONFIG.guiUrl, { waitUntil: 'networkidle' });

    // Get initial focus state
    const initialFocus = await page.evaluate(() => {
      return document.activeElement.tagName;
    });

    // Send Tab key multiple times
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
      await sleep(100);
    }

    // Check if focus moved
    const finalFocus = await page.evaluate(() => {
      return document.activeElement.tagName;
    });

    // Check for focus rings (blue outline)
    const hasFocusRing = await page.evaluate(() => {
      const focused = document.activeElement;
      const computed = window.getComputedStyle(focused);
      return computed.outline.includes('blue') ||
             computed.boxShadow.includes('blue') ||
             computed.border.includes('blue');
    });

    if (hasFocusRing) {
      recordTest('Keyboard Navigation', 'passed', 'Focus ring detected during Tab navigation');
    } else if (initialFocus !== finalFocus) {
      recordTest('Keyboard Navigation', 'passed', 'Focus movement detected (no visible ring)');
    } else {
      recordTest('Keyboard Navigation', 'failed', 'No focus movement detected');
    }

    await browser.close();

  } catch (error) {
    recordTest('Keyboard Navigation', 'failed', 'Failed to test keyboard navigation', error);
  }
}

/**
 * Test 6: SkipLinks
 */
async function testSkipLinks() {
  log('Starting SkipLinks test');

  try {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    await page.goto(CONFIG.guiUrl, { waitUntil: 'networkidle' });

    // Refresh page to reset state
    await page.reload({ waitUntil: 'networkidle' });

    // Press Tab to show first SkipLink
    await page.keyboard.press('Tab');
    await sleep(500);

    // Check for SkipLink visibility
    const skipLinkVisible = await page.evaluate(() => {
      const links = document.querySelectorAll('a[href^="#"]');
      for (const link of links) {
        if (link.textContent.toLowerCase().includes('skip')) {
          const style = window.getComputedStyle(link);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }
      }
      return false;
    });

    if (skipLinkVisible) {
      recordTest('SkipLinks', 'passed', 'SkipLinks appear when pressing Tab');

      // Test SkipLink functionality
      const skipLinkWorks = await page.evaluate(() => {
        const skipLink = document.querySelector('a[href^="#"]');
        if (skipLink) {
          const targetId = skipLink.getAttribute('href').substring(1);
          const target = document.getElementById(targetId);
          return target !== null;
        }
        return false;
      });

      if (skipLinkWorks) {
        recordTest('SkipLinks Functionality', 'passed', 'SkipLinks target valid elements');
      } else {
        recordTest('SkipLinks Functionality', 'failed', 'SkipLinks target invalid elements');
      }

    } else {
      recordTest('SkipLinks', 'failed', 'SkipLinks not visible after Tab press');
    }

    await browser.close();

  } catch (error) {
    recordTest('SkipLinks', 'failed', 'Failed to test SkipLinks', error);
  }
}

/**
 * Generate test report
 */
function generateReport() {
  const reportPath = path.join(CONFIG.projectRoot, 'AUTOMATED_TEST_RESULTS.md');

  let report = `# 🤖 Automated Test Results

**Generated:** ${new Date().toLocaleString()}
**Agent:** SignalX Automated Testing Agent

## 📊 Summary

- **Total Tests:** ${testResults.summary.total}
- **Passed:** ${testResults.summary.passed} ✅
- **Failed:** ${testResults.summary.failed} ❌
- **Skipped:** ${testResults.summary.skipped} ⏭️

**Overall Status:** ${testResults.summary.failed === 0 ? '🎉 ALL TESTS PASSED' : '⚠️ ISSUES FOUND'}

## 🧪 Detailed Results

`;

  testResults.tests.forEach((test, index) => {
    const statusEmoji = {
      passed: '✅',
      failed: '❌',
      skipped: '⏭️'
    }[test.status] || '❓';

    report += `### ${index + 1}. ${test.name} ${statusEmoji}

**Status:** ${test.status.toUpperCase()}
**Details:** ${test.details}
`;

    if (test.error) {
      report += `**Error:** ${test.error}\n`;
    }

    report += '\n';
  });

  // Add recommendations
  report += `## 💡 Recommendations

`;

  if (testResults.summary.failed > 0) {
    report += `- Review failed tests above\n`;
    report += `- Check logs for detailed error messages\n`;
    report += `- Ensure all dependencies are installed\n`;
    report += `- Verify Tauri build is up to date\n`;
  } else {
    report += `- All tests passed! 🎉\n`;
    report += `- Ready for production deployment\n`;
    report += `- Consider running manual verification tests\n`;
  }

  fs.writeFileSync(reportPath, report);
  log(`Report saved to: ${reportPath}`, '📄');
}

/**
 * Main test runner
 */
async function runAllTests() {
  log('🚀 Starting Automated Testing Agent for SignalX');
  log(`Project root: ${CONFIG.projectRoot}`);

  try {
    // Run tests in sequence
    await testTuiHelp();
    await testTuiSearch();

    const guiLaunched = await testGuiLaunch();

    if (guiLaunched) {
      await testAccessibilityTools();
      await testKeyboardNavigation();
      await testSkipLinks();

      // Clean up GUI process
      if (global.guiProcess) {
        global.guiProcess.kill();
      }
      if (global.viteProcess) {
        global.viteProcess.kill();
      }
    } else {
      // Skip GUI-dependent tests
      recordTest('Accessibility Tools', 'skipped', 'Skipped due to GUI launch failure');
      recordTest('Keyboard Navigation', 'skipped', 'Skipped due to GUI launch failure');
      recordTest('SkipLinks', 'skipped', 'Skipped due to GUI launch failure');
    }

    // Generate report
    generateReport();

    // Final summary
    const { passed, failed, total } = testResults.summary;
    const status = failed === 0 ? '🎉 SUCCESS' : '⚠️ ISSUES DETECTED';

    log(`Testing complete! ${status}`, failed === 0 ? '🎉' : '⚠️');
    log(`Results: ${passed}/${total} tests passed`);

    process.exit(failed === 0 ? 0 : 1);

  } catch (error) {
    log(`Critical error during testing: ${error.message}`, '🚨');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runAllTests();
}

module.exports = {
  runAllTests,
  testTuiHelp,
  testTuiSearch,
  testGuiLaunch,
  testAccessibilityTools,
  testKeyboardNavigation,
  testSkipLinks
};
