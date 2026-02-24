/**
 * Simplified show/list command for Deep Context
 *
 * Provides a beautiful, grouped view of all memories:
 * - dc show → shows all memories grouped by type
 * - dc show rules → shows only rules
 * - dc show choices → shows only choices
 * - dc show preferences → shows only preferences
 */

import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import type { Decision } from '../../memory/types.js';
import {
  icons,
  printGroupedMemories,
  emptyState,
  error,
} from '../ui.js';

/**
 * Get memory store
 */
function getStore(): MemoryStore {
  const root = findProjectRoot();
  if (!root) {
    throw new Error('Not in a Deep Context project. Run `dc init` first.');
  }

  const dbPath = getMemoryDbPath(root);
  return new MemoryStore(dbPath);
}

export const showCommand = new Command('show')
  .description('Show what AI remembers about this project')
  .option('-n, --limit <n>', 'Maximum items to show per type', '50')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('dc show')}              Show all memories grouped by type
  ${chalk.cyan('dc show rules')}        Show only rules
  ${chalk.cyan('dc show choices')}      Show only choices/decisions
  ${chalk.cyan('dc show preferences')}  Show only preferences
  ${chalk.cyan('dc show stats')}        Show memory statistics
`);

// dc show (all)
showCommand.action(async (options: { limit?: string }) => {
  try {
    const store = getStore();
    const limit = parseInt(options.limit ?? '50', 10);

    const memories = store.listMemories({ limit });

    if (memories.length === 0) {
      emptyState(
        'No memories yet.',
        'Add your first memory: dc add rule "Never use var"'
      );
      store.close();
      return;
    }

    // Show header with stats
    const stats = store.getStats();
    console.log();
    console.log(chalk.bold.white(`${icons.brain} AI Memory`));
    console.log(chalk.gray(`${stats.totalMemories} memories stored for this project`));

    // Print grouped memories
    printGroupedMemories(memories);

    // Show helpful tips
    console.log(chalk.gray('\u2500'.repeat(40)));
    console.log(chalk.dim(`  ${icons.search} Search: dc find "query"`));
    console.log(chalk.dim(`  ${icons.lightbulb} Add more: dc add rule|choice|preference "..."`));
    console.log();

    store.close();
  } catch (err) {
    if (err instanceof Error) {
      console.log(error(err.message));
    }
    process.exit(1);
  }
});

// dc show rules
showCommand
  .command('rules')
  .alias('rule')
  .description(`${icons.rule} Show only rules/constraints`)
  .option('-n, --limit <n>', 'Maximum items to show', '50')
  .action(async (options: { limit?: string }) => {
    try {
      const store = getStore();
      const limit = parseInt(options.limit ?? '50', 10);

      const memories = store.listMemories({ type: 'constraint', limit });

      if (memories.length === 0) {
        emptyState(
          'No rules yet.',
          'Add a rule: dc add rule "Never commit secrets"'
        );
        store.close();
        return;
      }

      console.log();
      console.log(`${icons.rule} ${chalk.bold.red('Rules')} ${chalk.gray(`(${memories.length})`)}`);
      console.log(chalk.red('\u2500'.repeat(40)));
      console.log();

      for (const memory of memories) {
        console.log(`   ${chalk.white(memory.content)}`);
        if (memory.context) {
          console.log(`   ${chalk.dim(memory.context)}`);
        }
        console.log(`   ${chalk.dim(`ID: ${memory.id}`)}`);
        console.log();
      }

      store.close();
    } catch (err) {
      if (err instanceof Error) {
        console.log(error(err.message));
      }
      process.exit(1);
    }
  });

// dc show choices
showCommand
  .command('choices')
  .alias('choice')
  .alias('decisions')
  .description(`${icons.choice} Show only choices/decisions`)
  .option('-n, --limit <n>', 'Maximum items to show', '50')
  .action(async (options: { limit?: string }) => {
    try {
      const store = getStore();
      const limit = parseInt(options.limit ?? '50', 10);

      const memories = store.listMemories({ type: 'decision', limit });

      if (memories.length === 0) {
        emptyState(
          'No choices recorded yet.',
          'Record a choice: dc add choice "Use PostgreSQL" --why "Need complex queries"'
        );
        store.close();
        return;
      }

      console.log();
      console.log(`${icons.choice} ${chalk.bold.blue('Choices')} ${chalk.gray(`(${memories.length})`)}`);
      console.log(chalk.blue('\u2500'.repeat(40)));
      console.log();

      for (const memory of memories) {
        console.log(`   ${chalk.white(memory.content)}`);
        // Decisions have rationale
        const decision = memory as Decision;
        if (decision.rationale) {
          console.log(`   ${chalk.dim(`\u2192 Why: ${decision.rationale}`)}`);
        }
        console.log(`   ${chalk.dim(`ID: ${memory.id}`)}`);
        console.log();
      }

      store.close();
    } catch (err) {
      if (err instanceof Error) {
        console.log(error(err.message));
      }
      process.exit(1);
    }
  });

// dc show preferences
showCommand
  .command('preferences')
  .alias('preference')
  .alias('prefs')
  .alias('pref')
  .description(`${icons.preference} Show only preferences/heuristics`)
  .option('-n, --limit <n>', 'Maximum items to show', '50')
  .action(async (options: { limit?: string }) => {
    try {
      const store = getStore();
      const limit = parseInt(options.limit ?? '50', 10);

      const memories = store.listMemories({ type: 'heuristic', limit });

      if (memories.length === 0) {
        emptyState(
          'No preferences yet.',
          'Add a preference: dc add preference "Prefer named exports"'
        );
        store.close();
        return;
      }

      console.log();
      console.log(`${icons.preference} ${chalk.bold.yellow('Preferences')} ${chalk.gray(`(${memories.length})`)}`);
      console.log(chalk.yellow('\u2500'.repeat(40)));
      console.log();

      for (const memory of memories) {
        console.log(`   ${chalk.white(memory.content)}`);
        if (memory.context) {
          console.log(`   ${chalk.dim(memory.context)}`);
        }
        console.log(`   ${chalk.dim(`ID: ${memory.id}`)}`);
        console.log();
      }

      store.close();
    } catch (err) {
      if (err instanceof Error) {
        console.log(error(err.message));
      }
      process.exit(1);
    }
  });

// dc show stats
showCommand
  .command('stats')
  .description('Show memory statistics')
  .action(async () => {
    try {
      const store = getStore();
      const stats = store.getStats();

      console.log();
      console.log(chalk.bold.white(`${icons.brain} Memory Statistics`));
      console.log(chalk.gray('\u2500'.repeat(30)));
      console.log();

      // Type counts with icons
      console.log(`   ${icons.rule} ${chalk.red('Rules:')}        ${chalk.bold(stats.constraintCount.toString())}`);
      console.log(`   ${icons.choice} ${chalk.blue('Choices:')}      ${chalk.bold(stats.decisionCount.toString())}`);
      console.log(`   ${icons.preference} ${chalk.yellow('Preferences:')}  ${chalk.bold(stats.heuristicCount.toString())}`);
      console.log(chalk.gray('   ' + '\u2500'.repeat(25)));
      console.log(`   ${chalk.white('Total:')}         ${chalk.bold.cyan(stats.totalMemories.toString())}`);
      console.log();

      // Friction info
      if (stats.totalFrictionEvents > 0) {
        console.log(chalk.gray('   Friction Stats:'));
        console.log(`   ${chalk.dim(`Events: ${stats.totalFrictionEvents}`)}`);
        console.log(`   ${chalk.dim(`Avg score: ${stats.averageFrictionScore.toFixed(2)}`)}`);
        console.log();
      }

      // Date info
      if (stats.oldestMemory) {
        console.log(chalk.gray('   Timeline:'));
        console.log(`   ${chalk.dim(`Oldest: ${stats.oldestMemory.toLocaleDateString()}`)}`);
        console.log(`   ${chalk.dim(`Newest: ${stats.newestMemory?.toLocaleDateString()}`)}`);
        console.log();
      }

      store.close();
    } catch (err) {
      if (err instanceof Error) {
        console.log(error(err.message));
      }
      process.exit(1);
    }
  });
