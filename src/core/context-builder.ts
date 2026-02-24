import type { Message } from '../adapters/types.js';
import type { MemoryRetriever } from '../memory/retriever.js';
import { formatMemoriesForContext } from '../memory/retriever.js';
import type { Constraint, RetrievalResult } from '../memory/types.js';

export interface ContextConfig {
  maxTokens: number;           // Total token budget
  systemTokens: number;        // Reserved for system prompt
  constraintTokens: number;    // Reserved for constraints
  conversationTokens: number;  // Reserved for conversation history
  decisionTokens: number;      // Reserved for decisions
  heuristicTokens: number;     // Reserved for heuristics
}

export const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  maxTokens: 8000,
  systemTokens: 500,
  constraintTokens: 1000,
  conversationTokens: 3000,
  decisionTokens: 2000,
  heuristicTokens: 500,
};

export interface BuiltContext {
  messages: Message[];
  tokenEstimate: number;
  memoryStats: {
    constraintsIncluded: number;
    decisionsIncluded: number;
    heuristicsIncluded: number;
    wasAmbiguous: boolean;
  };
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export class ContextBuilder {
  private config: ContextConfig;

  constructor(
    private retriever: MemoryRetriever,
    config: Partial<ContextConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
  }

  /**
   * Build complete context for an LLM call
   */
  async build(
    userPrompt: string,
    conversationHistory: Message[] = [],
    options: {
      includeMemory?: boolean;
      forceHeuristics?: boolean;
    } = {}
  ): Promise<BuiltContext> {
    const { includeMemory = true, forceHeuristics } = options;

    let constraints: Constraint[] = [];
    let decisions: RetrievalResult[] = [];
    let heuristics: RetrievalResult[] = [];
    let wasAmbiguous = false;

    // Retrieve memories if enabled
    if (includeMemory) {
      const retrieved = await this.retriever.retrieveForContext(userPrompt, {
        maxDecisions: 5,
        maxHeuristics: 3,
        includeHeuristics: forceHeuristics,
      });

      constraints = retrieved.constraints;
      decisions = retrieved.decisions;
      heuristics = retrieved.heuristics;
      wasAmbiguous = retrieved.isAmbiguous;
    }

    // Build system prompt with memory context
    const systemContent = this.buildSystemPrompt(constraints, decisions, heuristics);

    // Build messages array
    const messages: Message[] = [];

    // System message
    messages.push({
      role: 'system',
      content: systemContent,
    });

    // Conversation history (truncated to fit budget)
    const historyBudget = this.config.conversationTokens;
    const truncatedHistory = this.truncateHistory(conversationHistory, historyBudget);
    messages.push(...truncatedHistory);

    // User prompt
    messages.push({
      role: 'user',
      content: userPrompt,
    });

    // Estimate total tokens
    const tokenEstimate = messages.reduce(
      (sum, msg) => sum + estimateTokens(msg.content),
      0
    );

    return {
      messages,
      tokenEstimate,
      memoryStats: {
        constraintsIncluded: constraints.length,
        decisionsIncluded: decisions.length,
        heuristicsIncluded: heuristics.length,
        wasAmbiguous,
      },
    };
  }

  /**
   * Build the system prompt including memory context
   */
  private buildSystemPrompt(
    constraints: Constraint[],
    decisions: RetrievalResult[],
    heuristics: RetrievalResult[]
  ): string {
    const sections: string[] = [];

    // Base system prompt
    sections.push(`You are Deep Context, an AI coding assistant with persistent memory.
You remember past decisions and constraints for this project.
Always consider the project context when giving advice.`);

    // Add memory context if available
    if (constraints.length > 0 || decisions.length > 0 || heuristics.length > 0) {
      sections.push('\n# Project Memory\n');
      sections.push(formatMemoriesForContext(constraints, decisions, heuristics));
    }

    // Instructions for using memory
    if (constraints.length > 0) {
      sections.push(`\n**Important:** The constraints above are rules that MUST be followed.`);
    }

    if (decisions.length > 0) {
      sections.push(`\nThe decisions above represent past choices made for this project. Consider them when giving advice, but they can be reconsidered if there's good reason.`);
    }

    return sections.join('\n');
  }

  /**
   * Truncate conversation history to fit within token budget
   */
  private truncateHistory(history: Message[], maxTokens: number): Message[] {
    if (history.length === 0) return [];

    const result: Message[] = [];
    let totalTokens = 0;

    // Process from most recent to oldest
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i];
      const msgTokens = estimateTokens(msg.content);

      if (totalTokens + msgTokens <= maxTokens) {
        result.unshift(msg); // Add to front
        totalTokens += msgTokens;
      } else {
        // Can't fit any more messages
        break;
      }
    }

    return result;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function buildSimpleContext(
  userPrompt: string,
  conversationHistory: Message[] = [],
  systemPrompt?: string
): Message[] {
  const messages: Message[] = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }

  messages.push(...conversationHistory);
  messages.push({ role: 'user', content: userPrompt });

  return messages;
}
