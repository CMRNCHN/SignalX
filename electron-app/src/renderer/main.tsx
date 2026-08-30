import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../shared/types' // Ensures Window.api types are loaded

// Placeholder shell — swap in components from the existing UI as you go.
// Call window.api.* directly; types are inferred from shared/types.ts.
function App() {
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui' }}>
      <h1>SignalX</h1>
      <p>Core is wired. Drop in components here.</p>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
