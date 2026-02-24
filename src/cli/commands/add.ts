/**
 * Simplified add command for Deep Context
 *
 * Provides friendly aliases for adding memories:
 * - dc add rule "..." → adds a constraint
 * - dc add choice "..." --why "..." → adds a decision with rationale
 * - dc add preference "..." → adds a heuristic
 */

import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath, loadConfig, initProject } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { MemoryRetriever } from '../../memory/retriever.js';
import { createEmbedder } from '../../memory/embeddings.js';
import { icons, success, error, info } from '../ui.js';

/**
 * Auto-initialize Deep Context if not already initialized
 */
async function ensureInitialized(): Promise<string> {
  const root = findProjectRoot();
  if (root) {
    return root;
  }

  // Not in a DC project - auto-init
  const cwd = process.cwd();
  console.log();
  console.log(info('Deep Context not initialized. Auto-initializing...'));

  try {
    initProject(cwd);
    console.log(success('Initialized Deep Context'));
    console.log();
    return cwd;
  } catch (err) {
    throw new Error(`Failed to auto-initialize: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
}

/**
 * Get memory store and retriever
 */
async function getMemorySystem(): Promise<{
  store: MemoryStore;
  retriever: MemoryRetriever;
}> {
  const root = await ensureInitialized();

  const dbPath = getMemoryDbPath(root);
  const config = loadConfig(root);

  const store = new MemoryStore(dbPath);
  const embedder = await createEmbedder({
    provider: config.embeddings.provider as 'local' | 'simple' | 'ollama' | 'openai',
  });

  const retriever = new MemoryRetriever(store, embedder);

  return { store, retriever };
}

export const addCommand = new Command('add')
  .description('Add something for AI to remember')
  .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('dc add rule')} "Never use var, always use const or let"
  ${chalk.cyan('dc add choice')} "Use PostgreSQL" ${chalk.gray('--why')} "Need complex queries"
  ${chalk.cyan('dc add preference')} "Prefer functional components in React"

${chalk.bold('Types:')}
  ${icons.rule} ${chalk.red('rule')}        Hard constraint AI must follow (e.g., "Never commit .env files")
  ${icons.choice} ${chalk.blue('choice')}      Decision made for a reason (e.g., "Use TypeScript")
  ${icons.preference} ${chalk.yellow('preference')}  Soft preference (e.g., "Prefer named exports")
`);

// dc add rule "..."
addCommand
  .command('rule')
  .argument('<content...>', 'The rule content')
  .option('--context <context>', 'Additional context about this rule')
  .description(`${icons.rule} Add a rule that AI must always follow`)
  .action(async (content: string[], options: { context?: string }) => {
    const fullContent = content.join(' ');

    try {
      const { retriever, store } = await getMemorySystem();

      const metadata: Record<string, unknown> = { source: 'user' };
      if (options.context) metadata.context = options.context;

      const id = await retriever.addMemory('constraint', fullContent, metadata);

      console.log();
      console.log(success(`${chalk.bold('Rule added!')}`));
      console.log();
      console.log(`   ${icons.rule} ${chalk.white(fullContent)}`);
      if (options.context) {
        console.log(`   ${chalk.gray(`Context: ${options.context}`)}`);
      }
      console.log(`   ${chalk.dim(`ID: ${id}`)}`);
      console.log();
      console.log(chalk.gray(`   AI will now follow this rule in all conversations.`));
      console.log();

      store.close();
    } catch (err) {
      if (err instanceof Error) {
        console.log(error(err.message));
      }
      process.exit(1);
    }
  });

// dc add choice "..." --why "..."
addCommand
  .command('choice')
  .argument('<content...>', 'The choice/decision made')
  .option('--why <rationale>', 'Why this choice was made (recommended)')
  .option('--context <context>', 'Additional context')
  .description(`${icons.choice} Add a decision with its rationale`)
  .action(async (content: string[], options: { why?: string; context?: string }) => {
    const fullContent = content.join(' ');

    try {
      const { retriever, store } = await getMemorySystem();

      const metadata: Record<string, unknown> = { source: 'user' };
      if (options.why) metadata.rationale = options.why;
      if (options.context) metadata.context = options.context;

      const id = await retriever.addMemory('decision', fullContent, metadata);

      console.log();
      console.log(success(`${chalk.bold('Choice recorded!')}`));
      console.log();
      console.log(`   ${icons.choice} ${chalk.white(fullContent)}`);
      if (options.why) {
        console.log(`   ${chalk.gray(`\u2192 Why: ${options.why}`)}`);
      }
      if (options.context) {
        console.log(`   ${chalk.gray(`Context: ${options.context}`)}`);
      }
      console.log(`   ${chalk.dim(`ID: ${id}`)}`);
      console.log();

      if (!options.why) {
        console.log(chalk.yellow(`   ${icons.lightbulb} Tip: Add --why "reason" to help AI understand your decision`));
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

// dc add preference "..."
addCommand
  .command('preference')
  .alias('pref')
  .argument('<content...>', 'Your preference')
  .option('--context <context>', 'Additional context')
  .description(`${icons.preference} Add a soft preference for AI to consider`)
  .action(async (content: string[], options: { context?: string }) => {
    const fullContent = content.join(' ');

    try {
      const { retriever, store } = await getMemorySystem();

      const metadata: Record<string, unknown> = { source: 'user' };
      if (options.context) metadata.context = options.context;

      const id = await retriever.addMemory('heuristic', fullContent, metadata);

      console.log();
      console.log(success(`${chalk.bold('Preference saved!')}`));
      console.log();
      console.log(`   ${icons.preference} ${chalk.white(fullContent)}`);
      if (options.context) {
        console.log(`   ${chalk.gray(`Context: ${options.context}`)}`);
      }
      console.log(`   ${chalk.dim(`ID: ${id}`)}`);
      console.log();
      console.log(chalk.gray(`   AI will consider this preference when relevant.`));
      console.log();

      store.close();
    } catch (err) {
      if (err instanceof Error) {
        console.log(error(err.message));
      }
      process.exit(1);
    }
  });

// Default action when just `dc add` is called
addCommand.action(() => {
  addCommand.help();
});
