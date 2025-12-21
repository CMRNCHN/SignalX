import * as blessed from 'blessed';
import { Config, Logger, Module } from '../core/types';

export async function startTUI(config: Config, logger: Logger, modules: Module[]): Promise<void> {
  return new Promise<void>((resolve) => {
    // Create a screen object
    const screen = blessed.screen({
      smartCSR: true,
      title: 'SignalX',
    });

    // Header box
    const header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: `{center}{bold}SignalX - Terminal Operations Toolkit{/bold}{/center}\n{center}Version ${config.app.version} | Environment: ${config.app.environment}{/center}`,
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'white',
        },
      },
    });

    // Modules status box
    const modulesBox = blessed.box({
      top: 3,
      left: 0,
      width: '30%',
      height: '50%-3',
      content: generateModulesStatus(modules),
      label: ' Modules ',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan',
        },
      },
    });

    // Main content area
    const mainContent = blessed.box({
      top: 3,
      left: '30%',
      width: '70%',
      height: '50%-3',
      label: ' Console ',
      content: 'Welcome to SignalX!\n\nUse arrow keys to navigate.\nPress "q" or Ctrl+C to quit.',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan',
        },
      },
      scrollable: true,
      alwaysScroll: true,
      scrollbar: {
        ch: ' ',
        style: {
          bg: 'cyan',
        },
      },
    });

    // Log display area
    const logBox = blessed.log({
      top: '50%',
      left: 0,
      width: '100%',
      height: '50%-3',
      label: ' Logs ',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        border: {
          fg: 'green',
        },
      },
      scrollable: true,
      scrollbar: {
        ch: ' ',
        style: {
          bg: 'green',
        },
      },
    });

    // Footer / status bar
    const footer = blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: '{center}[q] Quit | [↑↓] Navigate | [Enter] Select | [?] Help{/center}',
      tags: true,
      border: {
        type: 'line',
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: 'white',
        },
      },
    });

    // Append elements to screen
    screen.append(header);
    screen.append(modulesBox);
    screen.append(mainContent);
    screen.append(logBox);
    screen.append(footer);

    // Add some initial log messages
    logBox.log('SignalX started successfully');
    logBox.log('All modules initialized');
    logBox.log('Press q to quit');

    // Focus on main content
    mainContent.focus();

    // Keyboard handlers
    screen.key(['q', 'C-c'], () => {
      logger.info('User requested shutdown');
      screen.destroy();
      resolve();
    });

    screen.key(['?'], () => {
      mainContent.setContent(generateHelpText());
      screen.render();
    });

    screen.key(['m'], () => {
      modulesBox.setContent(generateModulesStatus(modules));
      screen.render();
    });

    screen.key(['enter'], () => {
      logBox.log('Action triggered');
      screen.render();
    });

    // Render the screen
    screen.render();

    // Update modules status periodically
    const updateInterval = setInterval(() => {
      modulesBox.setContent(generateModulesStatus(modules));
      screen.render();
    }, 5000);

    // Clean up on exit
    screen.on('destroy', () => {
      clearInterval(updateInterval);
    });
  });
}

function generateModulesStatus(modules: Module[]): string {
  let content = '{bold}Active Modules:{/bold}\n\n';
  
  modules.forEach((module) => {
    content += `{green-fg}●{/green-fg} ${module.name}\n`;
  });
  
  if (modules.length === 0) {
    content += '{yellow-fg}No modules loaded{/yellow-fg}\n';
  }
  
  return content;
}

function generateHelpText(): string {
  return `{bold}SignalX Help{/bold}

{bold}Overview:{/bold}
SignalX is a terminal-first secure messaging and operations toolkit.

{bold}Keyboard Shortcuts:{/bold}
  q, Ctrl+C : Quit the application
  ↑ / ↓     : Navigate (when applicable)
  Enter     : Select / Execute
  ?         : Show this help
  m         : Refresh modules status

{bold}Modules:{/bold}
  • Messaging    : Secure message transmission
  • Routing      : Signal routing and events
  • Permissions  : Access control boundaries

{bold}Configuration:{/bold}
Use --config flag to specify a custom configuration file
or set environment variables (SIGNALX_ENV, SIGNALX_LOG_LEVEL)

Press any key to return to main view...`;
}
