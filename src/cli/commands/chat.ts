import chalk from 'chalk';
import { findProjectRoot, getMemoryDbPath, loadConfig } from '../../config/index.js';
import { MemoryStore } from '../../memory/store.js';
import { MemoryRetriever } from '../../memory/retriever.js';
import { createEmbedder } from '../../memory/embeddings.js';
import { ContextBuilder } from '../../core/context-builder.js';
import { createAdapterFromString } from '../../adapters/index.js';
import { Repl } from '../repl.js';

interface ChatOptions {
  model?: string;
  memory?: boolean;
  privacy?: boolean;
}

export async function chatCommand(options: ChatOptions): Promise<void> {
  const root = findProjectRoot();
  if (!root) {
    console.error(chalk.red('Not in a Deep Context project. Run `dc init` first.'));
    process.exit(1);
  }

  try {
    // Load configuration
    const config = loadConfig(root);

    // Determine model to use
    let modelString = options.model;
    if (!modelString) {
      // Build from config
      modelString = `${config.model.provider}:${config.model.name}`;
    }

    // Check for privacy mode
    if (options.privacy) {
      // Force local model in privacy mode
      if (!modelString.startsWith('ollama:')) {
        console.log(chalk.yellow('Privacy mode: switching to local Ollama model'));
        modelString = 'ollama:llama3.2';
      }
    }

    // Create model adapter
    console.log(chalk.gray(`Connecting to ${modelString}...`));
    const adapter = createAdapterFromString(modelString);

    // Health check
    const healthy = await adapter.healthCheck();
    if (!healthy) {
      console.error(chalk.red(`\nFailed to connect to ${adapter.name}`));

      if (adapter.provider === 'ollama') {
        console.log(chalk.gray('\nMake sure Ollama is running:'));
        console.log(chalk.cyan('  ollama serve'));
        console.log(chalk.gray('\nAnd the model is pulled:'));
        console.log(chalk.cyan(`  ollama pull ${modelString.split(':')[1]}`));
      } else {
        console.log(chalk.gray('\nCheck your API key and network connection.'));
      }

      process.exit(1);
    }

    // Set up memory system
    const dbPath = getMemoryDbPath(root);
    const store = new MemoryStore(dbPath);
    const embedder = await createEmbedder({
      provider: options.privacy ? 'simple' : (config.embeddings.provider as 'local' | 'simple' | 'ollama' | 'openai'),
    });
    const retriever = new MemoryRetriever(store, embedder);

    // Set up context builder
    const contextBuilder = new ContextBuilder(retriever);

    // Create and start REPL
    const repl = new Repl(adapter, contextBuilder, retriever, store, {
      useMemory: options.memory !== false,
      showDebug: false,
    });

    await repl.start();

  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error: ${error.message}`));
    }
    process.exit(1);
  }
}
