import type { MemoryStore } from './store.js';
import type { Embedder } from './embeddings.js';
import type {
  MemoryItem,
  MemoryType,
  Constraint,
  RetrievalResult,
  RetrievalOptions,
} from './types.js';

export class MemoryRetriever {
  constructor(
    private store: MemoryStore,
    private embedder: Embedder
  ) {}

  /**
   * Main retrieval method combining semantic search with friction weighting
   */
  async retrieve(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult[]> {
    const {
      type,
      limit = 10,
      minSimilarity = 0.3,
      includeFriction = true,
    } = options;

    // Generate query embedding
    const queryEmbedding = await this.embedder.embed(query);

    // Semantic search
    const types = type
      ? (Array.isArray(type) ? type : [type])
      : undefined;

    const candidates = this.store.vectorSearch(queryEmbedding, {
      limit: limit * 3, // Over-fetch for re-ranking
      types,
    });

    // Apply friction-based re-ranking
    const results = candidates
      .filter((c) => c.similarity >= minSimilarity)
      .map((c) => ({
        memory: c.memory,
        similarity: c.similarity,
        adjustedScore: includeFriction
          ? this.applyFrictionModifier(c.similarity, c.memory.frictionScore)
          : c.similarity,
      }))
      .sort((a, b) => b.adjustedScore - a.adjustedScore)
      .slice(0, limit);

    return results;
  }

  /**
   * Get ALL constraints (always injected, no semantic filtering)
   */
  getAllConstraints(): Constraint[] {
    return this.store.getAllConstraints();
  }

  /**
   * Retrieve decisions relevant to a query
   */
  async retrieveDecisions(
    query: string,
    limit: number = 5
  ): Promise<RetrievalResult[]> {
    return this.retrieve(query, {
      type: 'decision',
      limit,
      minSimilarity: 0.4,
    });
  }

  /**
   * Retrieve heuristics relevant to a query
   * Only called when ambiguity is detected
   */
  async retrieveHeuristics(
    query: string,
    limit: number = 3
  ): Promise<RetrievalResult[]> {
    return this.retrieve(query, {
      type: 'heuristic',
      limit,
      minSimilarity: 0.35,
    });
  }

  /**
   * Check if a prompt contains ambiguity signals
   * If true, heuristics should be activated
   */
  detectsAmbiguity(prompt: string): boolean {
    const ambiguitySignals = [
      /should i/i,
      /what('s| is) (the )?best/i,
      /how should/i,
      /which (one|approach|method|way)/i,
      /recommend/i,
      /prefer/i,
      /or should/i,
      /better to/i,
      /what do you think/i,
      /would you suggest/i,
      /\?.*\?/, // Multiple questions
      /either.*or/i,
      /trade-?off/i,
    ];

    return ambiguitySignals.some((pattern) => pattern.test(prompt));
  }

  /**
   * Full retrieval for context building:
   * 1. Always include all constraints
   * 2. Retrieve relevant decisions
   * 3. If ambiguous, also retrieve heuristics
   */
  async retrieveForContext(
    prompt: string,
    options: {
      maxDecisions?: number;
      maxHeuristics?: number;
      includeHeuristics?: boolean;
    } = {}
  ): Promise<{
    constraints: Constraint[];
    decisions: RetrievalResult[];
    heuristics: RetrievalResult[];
    isAmbiguous: boolean;
  }> {
    const {
      maxDecisions = 5,
      maxHeuristics = 3,
      includeHeuristics,
    } = options;

    // Always get all constraints
    const constraints = this.getAllConstraints();

    // Get relevant decisions
    const decisions = await this.retrieveDecisions(prompt, maxDecisions);

    // Check for ambiguity
    const isAmbiguous = this.detectsAmbiguity(prompt);

    // Get heuristics if ambiguous (or forced)
    let heuristics: RetrievalResult[] = [];
    if (includeHeuristics === true || (includeHeuristics !== false && isAmbiguous)) {
      heuristics = await this.retrieveHeuristics(prompt, maxHeuristics);
    }

    return {
      constraints,
      decisions,
      heuristics,
      isAmbiguous,
    };
  }

  /**
   * Add a memory with automatic embedding generation
   */
  async addMemory(
    type: MemoryType,
    content: string,
    metadata: Record<string, unknown> = {}
  ): Promise<string> {
    const embedding = await this.embedder.embed(content);

    switch (type) {
      case 'constraint':
        return this.store.addConstraint(
          {
            content,
            context: metadata.context as string | undefined,
            source: (metadata.source as 'user' | 'auto' | 'git') ?? 'user',
            scope: metadata.scope as string | undefined,
            severity: (metadata.severity as 'error' | 'warning') ?? 'warning',
          },
          embedding
        );

      case 'decision':
        return this.store.addDecision(
          {
            content,
            context: metadata.context as string | undefined,
            source: (metadata.source as 'user' | 'auto' | 'git') ?? 'user',
            rationale: (metadata.rationale as string) ?? '',
            alternatives: metadata.alternatives as string[] | undefined,
            relatedFiles: metadata.relatedFiles as string[] | undefined,
          },
          embedding
        );

      case 'heuristic':
        return this.store.addHeuristic(
          {
            content,
            context: metadata.context as string | undefined,
            source: (metadata.source as 'user' | 'auto' | 'git') ?? 'user',
            applicableWhen: metadata.applicableWhen as string | undefined,
            strength: (metadata.strength as 'strong' | 'moderate' | 'weak') ?? 'moderate',
          },
          embedding
        );

      default:
        throw new Error(`Unknown memory type: ${type}`);
    }
  }

  /**
   * Search memories by query
   */
  async search(
    query: string,
    options: { type?: MemoryType; limit?: number } = {}
  ): Promise<RetrievalResult[]> {
    return this.retrieve(query, {
      type: options.type,
      limit: options.limit ?? 10,
      minSimilarity: 0.2,
    });
  }

  /**
   * Friction modifier: positive friction boosts, negative friction dampens
   *
   * Formula: similarity * (1 + 0.5 * tanh(friction / 3))
   * - friction of +5 gives ~1.46x multiplier
   * - friction of -5 gives ~0.54x multiplier
   * - friction of 0 gives 1x (no change)
   */
  private applyFrictionModifier(similarity: number, friction: number): number {
    const modifier = 1 + (0.5 * Math.tanh(friction / 3));
    return similarity * modifier;
  }
}

export function formatMemoryForContext(memory: MemoryItem): string {
  const lines: string[] = [];

  switch (memory.type) {
    case 'constraint':
      lines.push(`[CONSTRAINT] ${memory.content}`);
      if (memory.scope) {
        lines.push(`  Scope: ${memory.scope}`);
      }
      break;

    case 'decision':
      lines.push(`[DECISION] ${memory.content}`);
      if (memory.rationale) {
        lines.push(`  Rationale: ${memory.rationale}`);
      }
      if (memory.alternatives && memory.alternatives.length > 0) {
        lines.push(`  Alternatives considered: ${memory.alternatives.join(', ')}`);
      }
      break;

    case 'heuristic':
      lines.push(`[HEURISTIC] ${memory.content}`);
      if (memory.applicableWhen) {
        lines.push(`  Applicable when: ${memory.applicableWhen}`);
      }
      break;
  }

  if (memory.context) {
    lines.push(`  Context: ${memory.context}`);
  }

  return lines.join('\n');
}

export function formatMemoriesForContext(
  constraints: Constraint[],
  decisions: RetrievalResult[],
  heuristics: RetrievalResult[]
): string {
  const sections: string[] = [];

  if (constraints.length > 0) {
    sections.push('## Project Constraints (Always Apply)');
    sections.push(constraints.map((c) => formatMemoryForContext(c)).join('\n\n'));
  }

  if (decisions.length > 0) {
    sections.push('## Relevant Past Decisions');
    sections.push(
      decisions
        .map((d) => `${formatMemoryForContext(d.memory)} (relevance: ${(d.adjustedScore * 100).toFixed(0)}%)`)
        .join('\n\n')
    );
  }

  if (heuristics.length > 0) {
    sections.push('## Applicable Heuristics');
    sections.push(
      heuristics
        .map((h) => formatMemoryForContext(h.memory))
        .join('\n\n')
    );
  }

  return sections.join('\n\n');
}
