/**
 * Interactive REPL for Deep Context
 *
 * Provides a chat interface with:
 * - Streaming responses
 * - Slash commands for memory management
 * - Conversation history
 * - Memory-augmented context
 */

import * as readline from 'readline';
import chalk from 'chalk';
import type { ModelAdapter, Message } from '../adapters/types.js';
import type { ContextBuilder } from '../core/context-builder.js';
import type { MemoryRetriever } from '../memory/retriever.js';
import type { MemoryStore } from '../memory/store.js';
import type { MemoryType } from '../memory/types.js';

export interface ReplConfig {
  useMemory: boolean;
  showDebug: boolean;
}

export class Repl {
  private rl: readline.Interface | null = null;
  private conversation: Message[] = [];
  private sessionId: string | null = null;
  private config: ReplConfig;

  constructor(
    private adapter: ModelAdapter,
    private contextBuilder: ContextBuilder,
    private retriever: MemoryRetriever,
    private store: MemoryStore,
    config: Partial<ReplConfig> = {}
  ) {
    this.config = {
      useMemory: true,
      showDebug: false,
      ...config,
    };
  }

  /**
   * Start the REPL
   */
  async start(): Promise<void> {
    // Start a session
    this.sessionId = this.store.startSession();

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.cyan('dc> '),
      terminal: true,
    });

    // Print welcome message
    this.printWelcome();

    // Handle line input
    this.rl.on('line', async (line) => {
      const trimmed = line.trim();

      if (!trimmed) {
        this.rl?.prompt();
        return;
      }

      try {
        if (trimmed.startsWith('/')) {
          await this.handleCommand(trimmed);
        } else {
          await this.handlePrompt(trimmed);
        }
      } catch (error) {
        if (error instanceof Error) {
          console.error(chalk.red(`\nError: ${error.message}\n`));
        }
      }

      this.rl?.prompt();
    });

    // Handle close
    this.rl.on('close', () => {
      this.cleanup();
      process.exit(0);
    });

    // Start prompting
    this.rl.prompt();
  }

  /**
   * Print welcome message
   */
  private printWelcome(): void {
    console.log();
    console.log(chalk.bold.cyan('Deep Context') + chalk.gray(' v0.1.0'));
    console.log(chalk.gray(`Model: ${this.adapter.name}`));
    console.log(chalk.gray(`Memory: ${this.config.useMemory ? 'enabled' : 'disabled'}`));
    console.log();
    console.log(chalk.gray('Type /help for commands, /quit to exit'));
    console.log();
  }

  /**
   * Handle a user prompt
   */
  private async handlePrompt(prompt: string): Promise<void> {
    // Build context with memory
    const context = await this.contextBuilder.build(
      prompt,
      this.conversation,
      { includeMemory: this.config.useMemory }
    );

    // Show memory stats if debug mode
    if (this.config.showDebug) {
      const stats = context.memoryStats;
      console.log(chalk.gray(
        `\n[Memory: ${stats.constraintsIncluded}C ${stats.decisionsIncluded}D ${stats.heuristicsIncluded}H` +
        `${stats.wasAmbiguous ? ' (ambiguous)' : ''} | ~${context.tokenEstimate} tokens]`
      ));
    }

    // Update session stats
    if (this.sessionId) {
      const memoryHits = context.memoryStats.constraintsIncluded +
        context.memoryStats.decisionsIncluded +
        context.memoryStats.heuristicsIncluded;
      this.store.incrementSessionCounters(this.sessionId, 1, memoryHits);
    }

    // Stream the response
    console.log();
    let fullResponse = '';

    try {
      for await (const chunk of this.adapter.streamComplete({
        messages: context.messages,
        temperature: 0.7,
        maxTokens: 4096,
      })) {
        process.stdout.write(chunk);
        fullResponse += chunk;
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`\nStream error: ${error.message}`));
      }
      return;
    }

    console.log('\n');

    // Update conversation history
    this.conversation.push(
      { role: 'user', content: prompt },
      { role: 'assistant', content: fullResponse }
    );
  }

  /**
   * Handle a slash command
   */
  private async handleCommand(input: string): Promise<void> {
    const parts = input.slice(1).split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (command) {
      case 'help':
      case 'h':
        this.printHelp();
        break;

      case 'quit':
      case 'exit':
      case 'q':
        this.cleanup();
        process.exit(0);
        break;

      case 'clear':
        this.conversation = [];
        console.log(chalk.gray('Conversation cleared.\n'));
        break;

      case 'memory':
      case 'm':
        await this.showMemoryStatus();
        break;

      case 'constraint':
      case 'c':
        if (args.length === 0) {
          console.log(chalk.yellow('Usage: /constraint <content>'));
        } else {
          await this.addMemory('constraint', args.join(' '));
        }
        break;

      case 'decision':
      case 'd':
        if (args.length === 0) {
          console.log(chalk.yellow('Usage: /decision <content>'));
        } else {
          await this.addMemory('decision', args.join(' '));
        }
        break;

      case 'heuristic':
        if (args.length === 0) {
          console.log(chalk.yellow('Usage: /heuristic <content>'));
        } else {
          await this.addMemory('heuristic', args.join(' '));
        }
        break;

      case 'search':
      case 's':
        if (args.length === 0) {
          console.log(chalk.yellow('Usage: /search <query>'));
        } else {
          await this.searchMemories(args.join(' '));
        }
        break;

      case 'debug':
        this.config.showDebug = !this.config.showDebug;
        console.log(chalk.gray(`Debug mode: ${this.config.showDebug ? 'on' : 'off'}\n`));
        break;

      case 'nomemory':
        this.config.useMemory = !this.config.useMemory;
        console.log(chalk.gray(`Memory: ${this.config.useMemory ? 'enabled' : 'disabled'}\n`));
        break;

      case 'history':
        this.showHistory();
        break;

      case 'model':
        console.log(chalk.gray(`Current model: ${this.adapter.name}\n`));
        break;

      default:
        console.log(chalk.yellow(`Unknown command: /${command}`));
        console.log(chalk.gray('Type /help for available commands.\n'));
    }
  }

  /**
   * Print help message
   */
  private printHelp(): void {
    console.log();
    console.log(chalk.bold('Commands:'));
    console.log();
    console.log(chalk.cyan('  /help, /h') + chalk.gray('         Show this help'));
    console.log(chalk.cyan('  /quit, /exit, /q') + chalk.gray('  Exit the chat'));
    console.log(chalk.cyan('  /clear') + chalk.gray('            Clear conversation history'));
    console.log(chalk.cyan('  /history') + chalk.gray('          Show conversation history'));
    console.log();
    console.log(chalk.bold('Memory:'));
    console.log();
    console.log(chalk.cyan('  /memory, /m') + chalk.gray('       Show memory status'));
    console.log(chalk.cyan('  /constraint <text>') + chalk.gray(' Add a constraint'));
    console.log(chalk.cyan('  /decision <text>') + chalk.gray('   Add a decision'));
    console.log(chalk.cyan('  /heuristic <text>') + chalk.gray('  Add a heuristic'));
    console.log(chalk.cyan('  /search <query>') + chalk.gray('    Search memories'));
    console.log();
    console.log(chalk.bold('Settings:'));
    console.log();
    console.log(chalk.cyan('  /debug') + chalk.gray('            Toggle debug output'));
    console.log(chalk.cyan('  /nomemory') + chalk.gray('         Toggle memory usage'));
    console.log(chalk.cyan('  /model') + chalk.gray('            Show current model'));
    console.log();
  }

  /**
   * Show memory status
   */
  private async showMemoryStatus(): Promise<void> {
    const stats = this.store.getStats();

    console.log();
    console.log(chalk.bold('Memory Status:'));
    console.log(`  Constraints: ${chalk.red(stats.constraintCount)}`);
    console.log(`  Decisions:   ${chalk.blue(stats.decisionCount)}`);
    console.log(`  Heuristics:  ${chalk.yellow(stats.heuristicCount)}`);
    console.log(`  Total:       ${chalk.cyan(stats.totalMemories)}`);
    console.log();
  }

  /**
   * Add a memory
   */
  private async addMemory(type: MemoryType, content: string): Promise<void> {
    const id = await this.retriever.addMemory(type, content, { source: 'user' });

    const typeColor = {
      constraint: chalk.red,
      decision: chalk.blue,
      heuristic: chalk.yellow,
    }[type];

    console.log(typeColor(`✓ Added ${type}:`));
    console.log(chalk.white(`  "${content}"`));
    console.log(chalk.gray(`  ID: ${id}`));
    console.log();
  }

  /**
   * Search memories
   */
  private async searchMemories(query: string): Promise<void> {
    const results = await this.retriever.search(query, { limit: 5 });

    if (results.length === 0) {
      console.log(chalk.gray(`No memories found matching "${query}"\n`));
      return;
    }

    console.log();
    console.log(chalk.bold(`Results for "${query}":`));
    console.log();

    for (const result of results) {
      const memory = result.memory;
      const typeColor = {
        constraint: chalk.red,
        decision: chalk.blue,
        heuristic: chalk.yellow,
      }[memory.type];

      const score = (result.adjustedScore * 100).toFixed(0);
      console.log(`${typeColor(`[${memory.type.toUpperCase()}]`)} ${memory.content}`);
      console.log(chalk.gray(`  Relevance: ${score}%`));
      console.log();
    }
  }

  /**
   * Show conversation history
   */
  private showHistory(): void {
    if (this.conversation.length === 0) {
      console.log(chalk.gray('No conversation history.\n'));
      return;
    }

    console.log();
    console.log(chalk.bold('Conversation History:'));
    console.log();

    for (const msg of this.conversation) {
      const prefix = msg.role === 'user' ? chalk.cyan('You: ') : chalk.green('DC:  ');
      const content = msg.content.length > 100
        ? msg.content.slice(0, 100) + '...'
        : msg.content;
      console.log(prefix + content);
    }

    console.log();
  }

  /**
   * Cleanup on exit
   */
  private cleanup(): void {
    // End session
    if (this.sessionId) {
      this.store.endSession(this.sessionId);
    }

    // Close store
    this.store.close();

    console.log(chalk.gray('\nGoodbye!\n'));
  }
}
