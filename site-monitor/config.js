module.exports = {
  // The URL of your filtered search page (after login)
  url: 'https://example.com/filtered-search',

  // CSS selector for the content to monitor
  // Update this to match what you want to track
  // Examples: '.search-results', '#results-container', '.item-list'
  contentSelector: '.search-results',

  // Your ntfy.sh topic (anything you want - acts as the "channel" for notifications)
  // You'll receive push notifications at: https://ntfy.sh/<topic>
  ntfyTopic: 'my-site-monitor',

  // Check interval in minutes (default: 10)
  checkInterval: 10,

  // Session storage location (do not commit this file to git!)
  sessionFile: './session.json',

  // Previous results storage (tracks changes)
  stateFile: './state.json',
};
