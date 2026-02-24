import { Command } from '@commander-js/extra-typings';
import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath, loadConfig } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { MemoryRetriever } from '../../memory/retriever.js';
import { createEmbedder } from '../../memory/embeddings.js';
import type { MemoryType } from '../../memory/types.js';

export const memoryCommand = new Command('memory')
  .description('Manage project memory (constraints, decisions, heuristics)');

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

// dc memory add <type> <content>
memoryCommand
  .command('add')
  .argument('<type>', 'Memory type: constraint, decision, or heuristic')
  .argument('<content...>', 'Memory content')
  .option('--context <context>', 'Additional context or rationale')
  .option('--rationale <rationale>', 'Rationale for decisions')
  .description('Add a new memory')
  .action(async (type: string, content: string[], options: { context?: string; rationale?: string }) => {
    const validTypes = ['constraint', 'decision', 'heuristic'];
    if (!validTypes.includes(type)) {
      console.error(chalk.red(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`));
      process.exit(1);
    }

    const fullContent = content.join(' ');

    try {
      const { retriever, store } = await getMemorySystem();

      const metadata: Record<string, unknown> = {};
      if (options.context) metadata.context = options.context;
      if (options.rationale) metadata.rationale = options.rationale;

      const id = await retriever.addMemory(
        type as MemoryType,
        fullContent,
        metadata
      );

      console.log(chalk.green(`✓ Added ${type}:`));
      console.log(chalk.white(`  "${fullContent}"`));
      console.log(chalk.gray(`  ID: ${id}`));
      if (options.context) {
        console.log(chalk.gray(`  Context: ${options.context}`));
      }

      store.close();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc memory list
memoryCommand
  .command('list')
  .option('-t, --type <type>', 'Filter by type: constraint, decision, heuristic')
  .option('-n, --limit <n>', 'Limit number of results', '20')
  .description('List memories')
  .action(async (options: { type?: string; limit?: string }) => {
    try {
      const { store } = await getMemorySystem();

      const memories = store.listMemories({
        type: options.type as MemoryType | undefined,
        limit: parseInt(options.limit ?? '20', 10),
      });

      if (memories.length === 0) {
        console.log(chalk.gray('No memories found.'));
        console.log(chalk.gray('\nAdd memories with:'));
        console.log(chalk.cyan('  dc memory add constraint "Never use var"'));
        console.log(chalk.cyan('  dc memory add decision "Use PostgreSQL" --rationale "Need complex queries"'));
        store.close();
        return;
      }

      console.log(chalk.bold(`\nMemories (${memories.length}):\n`));

      for (const memory of memories) {
        const typeColor = {
          constraint: chalk.red,
          decision: chalk.blue,
          heuristic: chalk.yellow,
        }[memory.type];

        console.log(`${typeColor(`[${memory.type.toUpperCase()}]`)} ${chalk.white(memory.content)}`);
        console.log(chalk.gray(`  ID: ${memory.id} | Friction: ${memory.frictionScore.toFixed(2)}`));

        if (memory.context) {
          console.log(chalk.gray(`  Context: ${memory.context}`));
        }

        if (memory.type === 'decision' && memory.rationale) {
          console.log(chalk.gray(`  Rationale: ${memory.rationale}`));
        }

        console.log();
      }

      store.close();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc memory search <query>
memoryCommand
  .command('search')
  .argument('<query...>', 'Search query')
  .option('-t, --type <type>', 'Filter by type')
  .option('-n, --limit <n>', 'Limit results', '10')
  .description('Search memories semantically')
  .action(async (query: string[], options: { type?: string; limit?: string }) => {
    const fullQuery = query.join(' ');

    try {
      const { retriever, store } = await getMemorySystem();

      const results = await retriever.search(fullQuery, {
        type: options.type as MemoryType | undefined,
        limit: parseInt(options.limit ?? '10', 10),
      });

      if (results.length === 0) {
        console.log(chalk.gray(`No memories found matching "${fullQuery}"`));
        store.close();
        return;
      }

      console.log(chalk.bold(`\nSearch results for "${fullQuery}":\n`));

      for (const result of results) {
        const memory = result.memory;
        const typeColor = {
          constraint: chalk.red,
          decision: chalk.blue,
          heuristic: chalk.yellow,
        }[memory.type];

        const score = (result.adjustedScore * 100).toFixed(0);

        console.log(`${typeColor(`[${memory.type.toUpperCase()}]`)} ${chalk.white(memory.content)}`);
        console.log(chalk.gray(`  Relevance: ${score}% | ID: ${memory.id}`));

        if (memory.context) {
          console.log(chalk.gray(`  Context: ${memory.context}`));
        }

        console.log();
      }

      store.close();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc memory delete <id>
memoryCommand
  .command('delete')
  .argument('<id>', 'Memory ID to delete')
  .option('-y, --yes', 'Skip confirmation')
  .description('Delete a memory')
  .action(async (id: string, options: { yes?: boolean }) => {
    try {
      const { store } = await getMemorySystem();

      const memory = store.getById(id);
      if (!memory) {
        console.error(chalk.red(`Memory not found: ${id}`));
        store.close();
        process.exit(1);
      }

      if (!options.yes) {
        console.log(chalk.yellow('About to delete:'));
        console.log(chalk.white(`  [${memory.type.toUpperCase()}] ${memory.content}`));
        console.log(chalk.gray('\nUse --yes to confirm deletion.'));
        store.close();
        return;
      }

      const deleted = store.delete(id);
      if (deleted) {
        console.log(chalk.green(`✓ Deleted memory: ${id}`));
      } else {
        console.error(chalk.red('Failed to delete memory'));
      }

      store.close();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

// dc memory stats
memoryCommand
  .command('stats')
  .description('Show memory statistics')
  .action(async () => {
    try {
      const { store } = await getMemorySystem();

      const stats = store.getStats();

      console.log(chalk.bold('\nMemory Statistics:\n'));
      console.log(`  Total memories: ${chalk.cyan(stats.totalMemories)}`);
      console.log(`  Constraints:    ${chalk.red(stats.constraintCount)}`);
      console.log(`  Decisions:      ${chalk.blue(stats.decisionCount)}`);
      console.log(`  Heuristics:     ${chalk.yellow(stats.heuristicCount)}`);
      console.log();
      console.log(`  Friction events: ${chalk.gray(stats.totalFrictionEvents)}`);
      console.log(`  Avg friction:    ${chalk.gray(stats.averageFrictionScore.toFixed(2))}`);

      if (stats.oldestMemory) {
        console.log();
        console.log(`  Oldest: ${chalk.gray(stats.oldestMemory.toLocaleDateString())}`);
        console.log(`  Newest: ${chalk.gray(stats.newestMemory?.toLocaleDateString())}`);
      }

      store.close();
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });
