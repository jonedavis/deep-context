// Three-tiered memory: Constraints (always injected), Decisions (semantic retrieval),
// Heuristics (activated during ambiguity)

export type MemoryType = 'constraint' | 'decision' | 'heuristic';
export type MemorySource = 'user' | 'auto' | 'git';
export type FrictionEventType =
  | 'iteration'    // User had to ask follow-up questions
  | 'correction'   // User explicitly corrected AI response
  | 'revert'       // Code changes were reverted
  | 'rejection'    // User rejected a suggestion
  | 'acceptance';  // Positive: user accepted/praised

export interface BaseMemory {
  id: string;
  type: MemoryType;
  content: string;
  context?: string;
  source: MemorySource;
  frictionScore: number;
  createdAt: Date;
  updatedAt: Date;
  active: boolean;
}

// Hard rules injected into every context. Should be few and critical.
export interface Constraint extends BaseMemory {
  type: 'constraint';
  scope?: string;  // Optional: limit to specific paths/patterns (e.g., "src/api/**")
  severity: 'error' | 'warning';
}

// Past choices retrieved by semantic similarity. Include rationale.
export interface Decision extends BaseMemory {
  type: 'decision';
  alternatives?: string[];  // What was considered but rejected
  rationale: string;        // Why this choice was made
  relatedFiles?: string[];  // Files affected by this decision
}

// Soft preferences, only activated when the prompt is ambiguous.
export interface Heuristic extends BaseMemory {
  type: 'heuristic';
  applicableWhen?: string;  // Conditions for activation
  strength: 'strong' | 'moderate' | 'weak';
}

export type MemoryItem = Constraint | Decision | Heuristic;

export interface CreateConstraintInput {
  content: string;
  context?: string;
  source?: MemorySource;
  scope?: string;
  severity?: 'error' | 'warning';
}

export interface CreateDecisionInput {
  content: string;
  context?: string;
  source?: MemorySource;
  alternatives?: string[];
  rationale: string;
  relatedFiles?: string[];
}

export interface CreateHeuristicInput {
  content: string;
  context?: string;
  source?: MemorySource;
  applicableWhen?: string;
  strength?: 'strong' | 'moderate' | 'weak';
}

export type CreateMemoryInput = CreateConstraintInput | CreateDecisionInput | CreateHeuristicInput;

export interface FrictionEvent {
  id: string;
  memoryId: string;
  eventType: FrictionEventType;
  delta: number;
  context?: string;
  createdAt: Date;
}

export interface Session {
  id: string;
  startedAt: Date;
  endedAt?: Date;
  promptCount: number;
  memoryHits: number;
}

export interface RetrievalResult {
  memory: MemoryItem;
  similarity: number;      // Raw cosine similarity (0-1)
  adjustedScore: number;   // After friction modifier
}

export interface RetrievalOptions {
  type?: MemoryType | MemoryType[];
  limit?: number;
  minSimilarity?: number;
  includeFriction?: boolean;
}

export interface VectorSearchOptions {
  limit: number;
  types?: MemoryType[];
}

export interface MemoryStats {
  totalMemories: number;
  constraintCount: number;
  decisionCount: number;
  heuristicCount: number;
  totalFrictionEvents: number;
  averageFrictionScore: number;
  oldestMemory?: Date;
  newestMemory?: Date;
}
