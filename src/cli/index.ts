import { Command } from '@commander-js/extra-typings';
import { chatCommand } from './commands/chat.js';
import { askCommand } from './commands/ask.js';
import { memoryCommand } from './commands/memory.js';
import { configCommand } from './commands/config.js';
import { initCommand } from './commands/init.js';
import { installCommand } from './commands/install.js';
import { syncCommand } from './commands/sync.js';
import { setupCommand } from './commands/setup.js';
import { statusCommand } from './commands/status.js';
// Simplified command aliases
import { addCommand } from './commands/add.js';
import { showCommand } from './commands/show.js';
import { findCommand } from './commands/find.js';
import { learnCommand } from './commands/learn.js';
// Project management commands
import { disableCommand } from './commands/disable.js';
import { enableCommand } from './commands/enable.js';
import { removeCommand } from './commands/remove.js';
import { cleanCommand } from './commands/clean.js';

export const program = new Command()
  .name('dc')
  .description('Deep Context - AI coding assistant with persistent memory')
  .version('0.1.0');

// Initialize a new project
program
  .command('init')
  .description('Initialize Deep Context in the current directory')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('-y, --yes', 'Auto-accept detected rules without prompting')
  .action(initCommand);

// Interactive setup wizard
program
  .command('setup')
  .description('Interactive setup wizard - configure language, style, and coding standards')
  .option('-t, --template <template>', 'Use a preset template (react, node-api, python-django)')
  .action(setupCommand);

// Install MCP server for LLM clients
program
  .command('install')
  .description('Install Deep Context MCP server for LLM clients (Claude Code, Cursor, etc.)')
  .option('--claude', 'Install only for Claude Code')
  .option('--cursor', 'Install only for Cursor')
  .option('--desktop', 'Install only for Claude Desktop')
  .option('--global', 'Install globally (not project-scoped)')
  .action(installCommand);

// Sync rules files
program
  .command('sync')
  .description('Generate/update CLAUDE.md and .cursorrules with Deep Context instructions')
  .option('-f, --force', 'Overwrite existing Deep Context sections')
  .action(syncCommand);

// Interactive chat mode
program
  .command('chat')
  .description('Start interactive chat session')
  .option('-m, --model <model>', 'Model to use (e.g., ollama:llama3.2, openai:gpt-4)')
  .option('--no-memory', 'Disable memory retrieval for this session')
  .option('--privacy', 'Enable privacy mode (no network requests)')
  .action(chatCommand);

// One-shot ask
program
  .command('ask <prompt...>')
  .description('Ask a single question')
  .option('-m, --model <model>', 'Model to use')
  .option('--no-memory', 'Disable memory retrieval')
  .action(askCommand);

// Memory management (advanced)
program.addCommand(memoryCommand);

// Configuration management
program.addCommand(configCommand);

// ===========================================
// Simplified command aliases (novice-friendly)
// ===========================================

// dc add rule/choice/preference
program.addCommand(addCommand);

// dc show [rules|choices|preferences|stats]
program.addCommand(showCommand);

// dc find "query"
program.addCommand(findCommand);

// dc learn (interactive)
program.addCommand(learnCommand);

// dc status - show Deep Context status
program
  .command('status')
  .description('Show Deep Context status - installations, connected tools, and projects')
  .action(statusCommand);

// ===========================================
// Project management commands
// ===========================================

// dc disable - Disable DC for current project
program
  .command('disable')
  .description('Disable Deep Context for current project (creates .dcignore)')
  .action(disableCommand);

// dc enable - Re-enable DC for current project
program
  .command('enable')
  .description('Re-enable Deep Context for current project')
  .option('-y, --yes', 'Auto-accept initialization without prompting')
  .action(enableCommand);

// dc remove - Completely remove DC from current project
program
  .command('remove')
  .description('Completely remove Deep Context from current project')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(removeCommand);

// dc clean - Clean up old/unused DC data
program
  .command('clean')
  .description('Clean up old/unused Deep Context data from inactive projects')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--dry-run', 'Show what would be cleaned without actually removing')
  .action(cleanCommand);

// Default to help if no command specified
program.action(() => {
  program.help();
});
