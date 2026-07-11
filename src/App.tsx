// Placeholder shell for SignalX.
// The real messaging UI (sidebar accounts, thread list, conversation view,
// composer, AI drafting, auto-reply controls) is built in a later phase and
// will overwrite this file. This exists only so the Tauri window renders.

export default function App() {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">SignalX</div>
        <nav className="app-nav">
          <span className="app-nav-placeholder">Accounts &amp; threads</span>
        </nav>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <h1>SignalX</h1>
        </header>
        <section className="app-content">
          <p className="app-hint">
            Tauri shell is up. The messaging UI is built in a later phase.
          </p>
        </section>
      </main>
    </div>
  );
}
