#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { MessagingModule } from '../modules/messaging';
import { RoutingModule } from '../modules/routing';
import { PermissionsModule } from '../modules/permissions';
import { startTUI } from '../tui';
import { ensureError } from '../core/utils';

const program = new Command();

program
  .name('signalx')
  .description('SignalX - Terminal-first secure messaging and operations toolkit')
  .version('0.1.0');

program
  .command('start')
  .description('Start SignalX in TUI mode')
  .option('-c, --config <path>', 'Path to configuration file')
  .action(async (options) => {
    try {
      const config = loadConfig(options.config);
      const logger = createLogger(config.logging, 'cli');
      
      logger.info('Starting SignalX...');
      
      // Initialize modules
      const modules = [];
      
      if (config.modules.messaging.enabled) {
        const messaging = new MessagingModule();
        await messaging.initialize(config.modules.messaging, createLogger(config.logging, 'messaging'));
        modules.push(messaging);
      }
      
      if (config.modules.routing.enabled) {
        const routing = new RoutingModule();
        await routing.initialize(config.modules.routing, createLogger(config.logging, 'routing'));
        modules.push(routing);
      }
      
      if (config.modules.permissions.enabled) {
        const permissions = new PermissionsModule();
        await permissions.initialize(config.modules.permissions, createLogger(config.logging, 'permissions'));
        modules.push(permissions);
      }
      
      // Start all modules
      for (const module of modules) {
        await module.start();
      }
      
      logger.info('All modules started successfully');
      
      // Start TUI
      await startTUI(config, logger, modules);
      
      // Stop all modules on exit
      for (const module of modules) {
        await module.stop();
      }
      
      logger.info('SignalX stopped');
    } catch (error) {
      const err = ensureError(error);
      console.error('Failed to start SignalX:', err.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check SignalX status')
  .option('-c, --config <path>', 'Path to configuration file')
  .action((options) => {
    const config = loadConfig(options.config);
    console.log('SignalX Status:');
    console.log(`  Environment: ${config.app.environment}`);
    console.log(`  Version: ${config.app.version}`);
    console.log(`  Logging Level: ${config.logging.level}`);
    console.log('\nModules:');
    console.log(`  Messaging: ${config.modules.messaging.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  Routing: ${config.modules.routing.enabled ? 'enabled' : 'disabled'}`);
    console.log(`  Permissions: ${config.modules.permissions.enabled ? 'enabled' : 'disabled'}`);
  });

program
  .command('config')
  .description('Display current configuration')
  .option('-c, --config <path>', 'Path to configuration file')
  .action((options) => {
    const config = loadConfig(options.config);
    console.log(JSON.stringify(config, null, 2));
  });

program.parse(process.argv);

// Show help if no command is provided
if (process.argv.length === 2) {
  program.help();
}
