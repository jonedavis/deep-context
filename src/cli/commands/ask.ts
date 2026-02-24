import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath, loadConfig } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { MemoryRetriever } from '../../memory/retriever.js';
import { createEmbedder } from '../../memory/embeddings.js';
import { ContextBuilder } from '../../core/context-builder.js';
import { createAdapterFromString } from '../../adapters/index.js';

interface AskOptions {
  model?: string;
  memory?: boolean;
}

export async function askCommand(prompt: string[], options: AskOptions): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
    process.exit(1);
  }

  const fullPrompt = prompt.join(' ');

  try {
    // Load configuration
    const config = loadConfig(root);

    // Determine model to use
    let modelString = options.model;
    if (!modelString) {
      modelString = `${config.model.provider}:${config.model.name}`;
    }

    // Create model adapter
    const adapter = createAdapterFromString(modelString);

    // Health check
    const healthy = await adapter.healthCheck();
    if (!healthy) {
      console.error(chalk.red(`Failed to connect to ${adapter.name}`));
      process.exit(1);
    }

    // Set up memory system if enabled
    let contextBuilder: ContextBuilder | null = null;
    let store: MemoryStore | null = null;

    if (options.memory !== false) {
      const dbPath = getMemoryDbPath(root);
      store = new MemoryStore(dbPath);
      const embedder = await createEmbedder({
        provider: config.embeddings.provider as 'local' | 'simple' | 'ollama' | 'openai',
      });
      const retriever = new MemoryRetriever(store, embedder);
      contextBuilder = new ContextBuilder(retriever);
    }

    // Build context
    let messages: { role: 'system' | 'user' | 'assistant'; content: string }[];

    if (contextBuilder) {
      const context = await contextBuilder.build(fullPrompt, [], {
        includeMemory: true,
      });
      messages = context.messages;

      // Show memory stats
      const stats = context.memoryStats;
      if (stats.constraintsIncluded > 0 || stats.decisionsIncluded > 0 || stats.heuristicsIncluded > 0) {
        console.log(chalk.gray(
          `[Memory: ${stats.constraintsIncluded} constraints, ` +
          `${stats.decisionsIncluded} decisions, ` +
          `${stats.heuristicsIncluded} heuristics]`
        ));
        console.log();
      }
    } else {
      messages = [{ role: 'user', content: fullPrompt }];
    }

    // Stream response
    for await (const chunk of adapter.streamComplete({
      messages,
      temperature: 0.7,
      maxTokens: 4096,
    })) {
      process.stdout.write(chunk);
    }

    console.log('\n');

    // Cleanup
    if (store) {
      store.close();
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}
