import blessed from 'blessed';
import fetch from 'node-fetch';

type Cfg = { baseUrl: string };

export function startUI(cfg: Cfg) {
  const screen = blessed.screen({ smartCSR: true, title: 'SignalX TUI' });

  const status = blessed.box({ top: 0, left: 0, height: 1, width: '100%', tags: true, content: `{bold}SignalX{/bold}  ${cfg.baseUrl}` });
  const threads = blessed.list({ top: 1, left: 0, width: '30%', height: '90%-1', keys: true, mouse: true, border: 'line', label: 'Threads' });
  const messages = blessed.box({ top: 1, left: '30%', width: '70%', height: '90%-1', border: 'line', label: 'Messages', scrollable: true, alwaysScroll: true, keys: true, mouse: true });
  const input = blessed.textbox({ bottom: 0, left: 0, height: 3, width: '100%', border: 'line', label: 'Compose', inputOnFocus: true });

  screen.append(status); screen.append(threads); screen.append(messages); screen.append(input);

  const state = { threadId: '' };

  async function loadThreads() {
    try {
      const r = await fetch(`${cfg.baseUrl}/threads`);
      const j = await r.json();
      threads.setItems(j.map((t: any) => `${t.title}::${t.id}`));
    } catch {
      threads.setItems(['(backend not reachable)']);
    }
    screen.render();
  }

  async function loadMessages(threadId: string) {
    try {
      const r = await fetch(`${cfg.baseUrl}/thread/${encodeURIComponent(threadId)}`);
      const j = await r.json();
      messages.setContent(j.messages.map((m: any) => `[${new Date(m.ts).toLocaleTimeString()}] ${m.from}: ${m.body}`).join('\n'));
      messages.setScrollPerc(100);
    } catch {
      messages.setContent('(failed to load messages)');
    }
    screen.render();
  }

  threads.on('select', (_, idx) => {
    const item = threads.getItem(idx)?.getText() ?? '';
    const parts = item.split('::');
    const id = parts[parts.length - 1];
    state.threadId = id;
    loadMessages(id);
  });

  input.on('submit', async (value: string) => {
    const body = (value ?? '').trim();
    input.clearValue(); screen.render();
    if (!body || !state.threadId) return;

    try {
      await fetch(`${cfg.baseUrl}/draft`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ threadId: state.threadId, body }),
      });
      await loadMessages(state.threadId);
    } catch {}
    input.focus();
  });

  screen.key(['q', 'C-c'], () => process.exit(0));
  input.focus();
  loadThreads();
  screen.render();
}
