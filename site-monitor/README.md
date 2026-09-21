# Site Monitor

Local website monitoring with push notifications. Checks a filtered search every 10 minutes and sends you a push notification if anything changes.

**Features:**
- ✅ Runs locally on your machine (fully private)
- ✅ Handles login + hCaptcha (manual one-time setup)
- ✅ Checks every 10 minutes
- ✅ Free push notifications via ntfy.sh
- ✅ No sensitive data stored in git

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure

Edit `config.js`:

```javascript
url: 'https://your-site.com/filtered-search',  // Your filtered search URL
contentSelector: '.search-results',             // CSS selector of content to monitor
ntfyTopic: 'my-site-monitor',                   // Notification channel
checkInterval: 10,                              // Minutes between checks
```

**Finding your CSS selector:**
- Open your browser DevTools (F12)
- Right-click on the content you want to monitor
- Select "Inspect" 
- Look for a class or ID you can use (e.g., `.results`, `#items`, `.list-container`)

### 3. One-time login setup

```bash
npm run setup
```

This will:
1. Open a browser window to your site
2. Let you log in manually
3. Let you solve the hCaptcha
4. Save your session locally

**Then press ENTER in the terminal when done.**

### 4. Start monitoring

```bash
npm start
```

The script will:
- Check every 10 minutes
- Send a push notification if changes are detected
- Keep running in the background

---

## Receiving notifications

Push notifications are sent to: **https://ntfy.sh/{your-topic}**

### On your phone:
- Visit: https://ntfy.sh/my-site-monitor (or your configured topic)
- You'll see notifications pop in as they arrive
- Bookmark it for easy access

### Better: Use a phone app
- **Android:** Download the [ntfy app](https://play.google.com/store/apps/details?id=io.heckel.ntfy) and subscribe to your topic
- **iOS:** Use [ntfy in Notcho](https://apps.apple.com/us/app/notcho/id1499942619) or visit the web version

---

## Troubleshooting

**"Session not found" error:**
- Run `npm run setup` again to re-authenticate

**Selector not found:**
- Check your CSS selector in `config.js` is correct
- Use DevTools to inspect the actual element

**Not detecting changes:**
- The site might require JavaScript rendering (already handled by Playwright)
- Try adjusting your CSS selector to capture more/different content

**Notifications not arriving:**
- Check: https://ntfy.sh/{your-topic} - notifications should appear there
- Verify `ntfyTopic` in config.js matches

---

## Privacy & Security

- ✅ All code runs locally on your machine
- ✅ Session/cookies stored locally only (`.gitignore` prevents git commits)
- ✅ Only network request is to ntfy.sh for notifications
- ✅ No credentials sent anywhere except the target site

---

## Stopping the monitor

Press `Ctrl+C` in your terminal.

---

## Advanced: Running in the background

To keep this running even when you close your terminal:

**macOS/Linux:**
```bash
nohup npm start > monitor.log 2>&1 &
```

**Windows:**
Run in a separate Command Prompt and minimize it, or use a task scheduler.

---

## Tips

- Session expires? Run `npm run setup` again
- Want to monitor something else? Update `config.js` and restart
- Check `state.json` to see when it last detected changes
- Monitor logs go to the terminal - pipe them to a file if desired
