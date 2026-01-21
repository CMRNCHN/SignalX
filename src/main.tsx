import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/feedback";
import { OnboardingProvider } from "./hooks/useOnboarding";
import { enableA11yChecking } from "./utils/a11yTesting";
import { getAnnouncer } from "./utils/announcer";
import { registerGlobalErrorHandlers } from "./utils/logger";
import { registerSelfFix } from "./utils/tauri";
import { registerExamplePlugins } from "../packages/signal_plugin_system/src/plugins/examples";
import "./index.css";

// Initialize plugin system
registerExamplePlugins();

// Register global error handlers and self-fix helpers
registerGlobalErrorHandlers();
registerSelfFix();

// Initialize accessibility features in development
if (import.meta.env.DEV) {
  enableA11yChecking();
  console.log(
    '%c♿ Accessibility Framework Active',
    'color: #3b82f6; font-weight: bold; font-size: 14px'
  );
  console.log('Available commands:');
  console.log('  window.checkA11y() - Check for accessibility issues');
  console.log('  window.testKeyboardNav() - Test keyboard navigation');
  console.log('  window.logA11yPerformance() - View performance metrics');
}

// Initialize live region announcer
getAnnouncer();

// Mount the React application to the DOM.  The id "root" is defined in
// index.html which Vite injects into the Tauri window.  React 18's
// createRoot API is used for concurrent rendering.
const container = document.getElementById("root");
const root = ReactDOM.createRoot(container!);

const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
  // In a real app, you might want to log this to a service
  console.error('Application Error:', error, errorInfo);
};

root.render(
  <ErrorBoundary level="page" onError={handleError}>
    <OnboardingProvider>
      <App />
    </OnboardingProvider>
  </ErrorBoundary>
);