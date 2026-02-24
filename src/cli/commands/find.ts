/**
 * Simplified find/search command for Deep Context
 *
 * Provides semantic search with beautiful results:
 * - dc find "query" → searches all memories
 * - Shows results with relevance percentage
 */

import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath, loadConfig } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { MemoryRetriever } from '../../memory/retriever.js';
import { createEmbedder } from '../../memory/embeddings.js';
import {
  icons,
  error,
  getTypeIcon,
  getFriendlyTypeName,
  typeColors,
} from '../ui.js';
import type { Decision } from '../../memory/types.js';

/**
 * Get memory store and retriever
 */
async function getMemorySystem(): Promise<{
  store: MemoryStore;
  retriever: MemoryRetriever;
}> {
  const root = findProjectRoot();
  if (!root) {
    throw new Error('Not in a Deep Context project. Run `dc init` first.');
  }

  const dbPath = getMemoryDbPath(root);
  const config = loadConfig(root);

  const store = new MemoryStore(dbPath);
  const embedder = await createEmbedder({
    provider: config.embeddings.provider as 'local' | 'simple' | 'ollama' | 'openai',
  });

  const retriever = new MemoryRetriever(store, embedder);

  return { store, retriever };
}

export const findCommand = new Command('find')
  .argument('<query...>', 'What to search for')
  .option('-t, --type <type>', 'Filter by type: rule, choice, preference')
  .option('-n, --limit <n>', 'Maximum results to show', '10')
  .description(`${icons.search} Search memories semantically`)
  .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.cyan('dc find')} "database"          Search for anything about databases
  ${chalk.cyan('dc find')} "testing" ${chalk.gray('--type rule')}  Search only in rules
  ${chalk.cyan('dc find')} "style" ${chalk.gray('-n 5')}         Show only top 5 results

${chalk.bold('How it works:')}
  Deep Context uses semantic search, so it understands meaning.
  Searching "database" will also find "PostgreSQL", "SQL", etc.
`);

findCommand.action(async (queryParts: string[], options: { type?: string; limit?: string }) => {
  const query = queryParts.join(' ');

  try {
    const { retriever, store } = await getMemorySystem();

    // Map friendly type names to internal types
    let typeFilter: 'constraint' | 'decision' | 'heuristic' | undefined;
    if (options.type) {
      switch (options.type.toLowerCase()) {
        case 'rule':
        case 'constraint':
        case 'rules':
          typeFilter = 'constraint';
          break;
        case 'choice':
        case 'decision':
        case 'choices':
        case 'decisions':
          typeFilter = 'decision';
          break;
        case 'preference':
        case 'heuristic':
        case 'preferences':
        case 'prefs':
        case 'pref':
          typeFilter = 'heuristic';
          break;
        default:
          console.log(chalk.yellow(`${icons.warn} Unknown type: ${options.type}`));
          console.log(chalk.gray('   Use: rule, choice, or preference'));
          store.close();
          process.exit(1);
      }
    }

    const limit = parseInt(options.limit ?? '10', 10);

    console.log();
    console.log(`${icons.search} ${chalk.bold('Searching:')} ${chalk.cyan(`"${query}"`)}`);
    console.log(chalk.gray('\u2500'.repeat(40)));

    const results = await retriever.search(query, {
      type: typeFilter,
      limit,
    });

    if (results.length === 0) {
      console.log();
      console.log(chalk.gray(`   No memories found matching "${query}"`));
      console.log();

      // Suggest what to do
      const stats = store.getStats();
      if (stats.totalMemories === 0) {
        console.log(chalk.gray('   You haven\'t added any memories yet.'));
        console.log(chalk.gray(`   Try: ${chalk.cyan('dc add rule "..."')}`));
      } else {
        console.log(chalk.gray(`   You have ${stats.totalMemories} memories. Try a different query.`));
        console.log(chalk.gray(`   View all: ${chalk.cyan('dc show')}`));
      }
      console.log();

      store.close();
      return;
    }

    console.log();
    console.log(chalk.bold(`Found ${results.length} result${results.length === 1 ? '' : 's'}:`));
    console.log();

    for (const result of results) {
      const memory = result.memory;
      const percentage = Math.round(result.adjustedScore * 100);

      // Color percentage by relevance
      let percentColor = chalk.red;
      if (percentage >= 80) percentColor = chalk.green;
      else if (percentage >= 60) percentColor = chalk.yellow;
      else if (percentage >= 40) percentColor = chalk.cyan;

      const icon = getTypeIcon(memory.type);
      const colorFn = typeColors[memory.type as keyof typeof typeColors] || chalk.white;
      const typeName = getFriendlyTypeName(memory.type);

      // Main line with icon, type badge, and content
      console.log(`   ${icon} ${colorFn(`[${typeName}]`)} ${chalk.white(memory.content)}`);

      // Relevance and metadata
      let metaLine = `      ${percentColor(`${percentage}%`)} match`;

      // Only decisions have rationale
      if (memory.type === 'decision' && (memory as Decision).rationale) {
        metaLine += ` ${chalk.gray('|')} ${chalk.dim(`Why: ${(memory as Decision).rationale}`)}`;
      }

      console.log(metaLine);
      console.log();
    }

    // Footer with tips
    console.log(chalk.gray('\u2500'.repeat(40)));
    console.log(chalk.dim(`  Results ranked by semantic similarity`));
    console.log();

    store.close();
  } catch (err) {
    if (err instanceof Error) {
      console.log(error(err.message));
    }
    process.exit(1);
  }
});
