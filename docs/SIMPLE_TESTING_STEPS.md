# 🧪 Simple Testing Steps

Follow these steps in order. Each takes 1-2 minutes.

---

## **STEP 1: Test TUI Help Screen**

### Commands

```bash
cd /Users/cameroncohen/Developer/apps/signalx
./src-tauri/target/release/signalx-tui
```

### What to do

1. Press `?` (question mark key)
2. Look for a help dialog with keyboard shortcuts
3. Press `?` again or `Esc` to close

### ✅ Pass if

- Help dialog appears
- Shows shortcuts for j/k, i, /, r, q
- Can close with ? or Esc

### ❌ Fail if

- Nothing happens when pressing ?
- Help dialog doesn't show
- Can't close the dialog

**Press `q` to quit TUI when done**

---

## **STEP 2: Test TUI Search**

### Commands

```bash
cd /Users/cameroncohen/Developer/apps/signalx
./src-tauri/target/release/signalx-tui
```

### What to do

1. Press `/` (forward slash key)
2. Type any word (e.g., "test")
3. Look at the status bar at bottom
4. Press `Esc` to cancel

### ✅ Pass if

- Status bar shows "Search: test"
- Can type characters
- Esc cancels and clears search

### ❌ Fail if

- Nothing happens when pressing /
- Can't type search query
- Search doesn't show in status bar

**Press `q` to quit TUI when done**

---

## **STEP 3: Test GUI Launch**

### Commands

```bash
cd /Users/cameroncohen/Developer/apps/signalx
npm run tauri:dev
```

**Or use the launcher:**

```bash
./launch_signalx.sh
```

### What to do

1. Wait 30-60 seconds for app to build and launch
2. Look for SignalX window to appear

### ✅ Pass if

- SignalX window opens
- Can see the interface (sidebar, messages area)
- No error dialogs

### ❌ Fail if

- Window doesn't open after 2 minutes
- See error messages
- App crashes

**Keep the app open for next tests**

---

## **STEP 4: Test Accessibility Tools**

### Requirements

- SignalX GUI must be running (from Step 3)

### What to do

1. Press `F12` (or `Cmd+Option+I` on Mac)
2. Click **Console** tab in DevTools
3. Type this and press Enter:

   ```javascript
   window.checkA11y()
   ```

4. Look for green checkmarks and results

### ✅ Pass if

- Console shows "♿ Accessibility Check Results"
- Shows checkmarks (✓) for various checks
- Says "All checks passed!" or shows issue count

### ❌ Fail if

- Error: "window.checkA11y is not a function"
- Console shows errors
- Nothing happens

**Try these too:**

```javascript
window.testKeyboardNav()      // Should show focusable element count
window.logA11yPerformance()   // Should show performance metrics
```

---

## **STEP 5: Test Keyboard Navigation**

### Requirements

- SignalX GUI must be running

### What to do

1. Click anywhere in the SignalX window
2. Press `Tab` key
3. Keep pressing `Tab` and watch for blue outline
4. Press `Tab` about 10 times

### ✅ Pass if

- See blue outline (focus ring) around elements
- Focus moves to different buttons/inputs as you Tab
- Can reach sidebar, thread list, buttons

### ❌ Fail if

- No blue outline appears
- Tab does nothing
- Focus gets stuck or disappears

---

## **STEP 6: Test SkipLinks**

### Requirements

- SignalX GUI must be running

### What to do

1. Press `Cmd+R` (or `F5`) to refresh the page
2. Immediately press `Tab` key once
3. Look at **top-left corner** of window
4. Should see a link appear

### ✅ Pass if

- A black box appears at top-left saying "Skip to sidebar"
- Press Tab again → another SkipLink appears
- Press Tab again → third SkipLink appears
- Press Enter on a SkipLink → focus jumps to that section

### ❌ Fail if

- Nothing appears when pressing Tab
- No SkipLinks visible
- Pressing Enter doesn't jump anywhere

---

## **📋 Quick Checklist**

Copy this and check off as you test:

```
[ ] Step 1: TUI Help Screen (?)
[ ] Step 2: TUI Search (/)
[ ] Step 3: GUI Launch
[ ] Step 4: Accessibility Tools (window.checkA11y())
[ ] Step 5: Keyboard Navigation (Tab key)
[ ] Step 6: SkipLinks
```

---

## **🎯 Results Summary**

After testing, fill this out:

**Tests Passed:** ___ / 6

**Issues Found:**

- (Write any problems here)

**Overall Status:**

- [ ] All tests passed → 🎉 READY FOR PRODUCTION
- [ ] Some tests failed → See issues above
- [ ] Couldn't run tests → Check environment setup

---

## **💡 Quick Troubleshooting**

### TUI won't start

```bash
# Set Signal number (use your actual number)
export SIGNALX_NUMBER="+1234567890"
./src-tauri/target/release/signalx-tui
```

### GUI won't start

```bash
# Check if npm exists
which npm

# If not found, you may need to install Node.js
# Or run from a terminal that has npm in PATH
```

### Accessibility tools not working

- Make sure you're in **development mode** (npm run tauri:dev)
- Production builds won't have these tools
- Check console for "♿ Accessibility Framework Active" message

---

## **📞 Need More Help?**

See these files:

- `TEST_VERIFICATION.md` - Detailed testing guide
- `AUTOMATED_TEST_RESULTS.md` - What's already verified
- `PROGRESS.md` - Project status
- `SESSION_SUMMARY_DEC26.md` - Full summary

---

**That's it! 6 simple steps!** 🚀

**Time needed:** ~10 minutes total
