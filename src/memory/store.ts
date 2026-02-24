import * as fs from 'fs';
import Database from 'better-sqlite3';
import { nanoid } from 'nanoid';
import type {
  MemoryItem,
  MemoryType,
  MemorySource,
  Constraint,
  Decision,
  Heuristic,
  CreateConstraintInput,
  CreateDecisionInput,
  CreateHeuristicInput,
  FrictionEvent,
  FrictionEventType,
  MemoryStats,
  VectorSearchOptions,
} from './types.js';

const EMBEDDING_DIM = 384;

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.runMigrations();

    // Restrict database file permissions (owner read/write only)
    try {
      fs.chmodSync(dbPath, 0o600);
    } catch {
      // May fail on some filesystems - not critical
    }
  }

  private runMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now'))
      );
    `);

    const appliedMigrations = new Set(
      this.db.prepare('SELECT name FROM migrations').all()
        .map((row) => (row as { name: string }).name)
    );

    // Migration 001: Initial schema
    if (!appliedMigrations.has('001_initial')) {
      this.db.exec(`
        -- Core memory items table
        CREATE TABLE memory_items (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL CHECK (type IN ('constraint', 'decision', 'heuristic')),
          content TEXT NOT NULL,
          context TEXT,
          source TEXT NOT NULL DEFAULT 'user' CHECK (source IN ('user', 'auto', 'git')),
          friction_score REAL DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          active INTEGER DEFAULT 1,

          -- Type-specific fields stored as JSON
          metadata TEXT DEFAULT '{}'
        );

        -- Embeddings table (separate for cleaner queries)
        CREATE TABLE memory_embeddings (
          id TEXT PRIMARY KEY REFERENCES memory_items(id) ON DELETE CASCADE,
          embedding BLOB NOT NULL
        );

        -- Friction events log
        CREATE TABLE friction_events (
          id TEXT PRIMARY KEY,
          memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL CHECK (event_type IN (
            'iteration', 'correction', 'revert', 'rejection', 'acceptance'
          )),
          delta REAL NOT NULL,
          context TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );

        -- Sessions for context tracking
        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          started_at TEXT DEFAULT (datetime('now')),
          ended_at TEXT,
          prompt_count INTEGER DEFAULT 0,
          memory_hits INTEGER DEFAULT 0
        );

        -- Links between sessions and memories used
        CREATE TABLE session_memories (
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          memory_id TEXT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
          relevance_score REAL,
          was_helpful INTEGER,
          PRIMARY KEY (session_id, memory_id)
        );

        -- Indexes
        CREATE INDEX idx_memory_type ON memory_items(type);
        CREATE INDEX idx_memory_active ON memory_items(active);
        CREATE INDEX idx_memory_created ON memory_items(created_at);
        CREATE INDEX idx_friction_memory ON friction_events(memory_id);
        CREATE INDEX idx_friction_time ON friction_events(created_at);
        CREATE INDEX idx_session_time ON sessions(started_at);
      `);

      this.db.prepare('INSERT INTO migrations (name) VALUES (?)').run('001_initial');
    }
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  addConstraint(input: CreateConstraintInput, embedding?: Float32Array): string {
    const id = nanoid();
    const metadata = JSON.stringify({
      scope: input.scope,
      severity: input.severity ?? 'warning',
    });

    this.db.prepare(`
      INSERT INTO memory_items (id, type, content, context, source, metadata)
      VALUES (?, 'constraint', ?, ?, ?, ?)
    `).run(id, input.content, input.context ?? null, input.source ?? 'user', metadata);

    if (embedding) {
      this.setEmbedding(id, embedding);
    }

    return id;
  }

  addDecision(input: CreateDecisionInput, embedding?: Float32Array): string {
    const id = nanoid();
    const metadata = JSON.stringify({
      alternatives: input.alternatives,
      rationale: input.rationale,
      relatedFiles: input.relatedFiles,
    });

    this.db.prepare(`
      INSERT INTO memory_items (id, type, content, context, source, metadata)
      VALUES (?, 'decision', ?, ?, ?, ?)
    `).run(id, input.content, input.context ?? null, input.source ?? 'user', metadata);

    if (embedding) {
      this.setEmbedding(id, embedding);
    }

    return id;
  }

  addHeuristic(input: CreateHeuristicInput, embedding?: Float32Array): string {
    const id = nanoid();
    const metadata = JSON.stringify({
      applicableWhen: input.applicableWhen,
      strength: input.strength ?? 'moderate',
    });

    this.db.prepare(`
      INSERT INTO memory_items (id, type, content, context, source, metadata)
      VALUES (?, 'heuristic', ?, ?, ?, ?)
    `).run(id, input.content, input.context ?? null, input.source ?? 'user', metadata);

    if (embedding) {
      this.setEmbedding(id, embedding);
    }

    return id;
  }

  getById(id: string): MemoryItem | null {
    const row = this.db.prepare(`
      SELECT * FROM memory_items WHERE id = ? AND active = 1
    `).get(id) as MemoryRow | undefined;

    return row ? this.rowToMemory(row) : null;
  }

  getByType(type: MemoryType): MemoryItem[] {
    const rows = this.db.prepare(`
      SELECT * FROM memory_items
      WHERE type = ? AND active = 1
      ORDER BY created_at DESC
    `).all(type) as MemoryRow[];

    return rows.map((row) => this.rowToMemory(row));
  }

  getAllConstraints(): Constraint[] {
    return this.getByType('constraint') as Constraint[];
  }

  delete(id: string): boolean {
    const result = this.db.prepare(`
      UPDATE memory_items SET active = 0, updated_at = datetime('now')
      WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  hardDelete(id: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM memory_items WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  updateContent(id: string, content: string, embedding?: Float32Array): boolean {
    const result = this.db.prepare(`
      UPDATE memory_items
      SET content = ?, updated_at = datetime('now')
      WHERE id = ? AND active = 1
    `).run(content, id);

    if (result.changes > 0 && embedding) {
      this.setEmbedding(id, embedding);
    }

    return result.changes > 0;
  }

  setEmbedding(id: string, embedding: Float32Array): void {
    if (embedding.length !== EMBEDDING_DIM) {
      throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${embedding.length}`);
    }

    const buffer = Buffer.from(embedding.buffer);

    this.db.prepare(`
      INSERT OR REPLACE INTO memory_embeddings (id, embedding)
      VALUES (?, ?)
    `).run(id, buffer);
  }

  getEmbedding(id: string): Float32Array | null {
    const row = this.db.prepare(`
      SELECT embedding FROM memory_embeddings WHERE id = ?
    `).get(id) as { embedding: Buffer } | undefined;

    if (!row) return null;

    const expectedBytes = EMBEDDING_DIM * 4; // Float32 = 4 bytes each
    if (row.embedding.length !== expectedBytes) {
      return null;
    }

    return new Float32Array(row.embedding.buffer, row.embedding.byteOffset, EMBEDDING_DIM);
  }

  // Pure-JS cosine similarity search (no sqlite-vec dependency)
  vectorSearch(
    queryEmbedding: Float32Array,
    options: VectorSearchOptions
  ): Array<{ memory: MemoryItem; similarity: number }> {
    let rows: Array<MemoryRow & { embedding: Buffer }>;

    if (options.types && options.types.length > 0) {
      const placeholders = options.types.map(() => '?').join(',');
      rows = this.db.prepare(`
        SELECT m.*, e.embedding
        FROM memory_items m
        JOIN memory_embeddings e ON m.id = e.id
        WHERE m.active = 1 AND m.type IN (${placeholders})
      `).all(...options.types) as Array<MemoryRow & { embedding: Buffer }>;
    } else {
      rows = this.db.prepare(`
        SELECT m.*, e.embedding
        FROM memory_items m
        JOIN memory_embeddings e ON m.id = e.id
        WHERE m.active = 1
      `).all() as Array<MemoryRow & { embedding: Buffer }>;
    }

    const results = rows.map((row) => {
      const embedding = new Float32Array(
        row.embedding.buffer,
        row.embedding.byteOffset,
        EMBEDDING_DIM
      );
      const similarity = this.cosineSimilarity(queryEmbedding, embedding);

      return {
        memory: this.rowToMemory(row),
        similarity,
      };
    });

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, options.limit);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  recordFrictionEvent(
    memoryId: string,
    eventType: FrictionEventType,
    delta: number,
    context?: string
  ): string {
    const id = nanoid();

    this.transaction(() => {
      this.db.prepare(`
        INSERT INTO friction_events (id, memory_id, event_type, delta, context)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, memoryId, eventType, delta, context ?? null);

      // Clamp to [-10, 10]
      this.db.prepare(`
        UPDATE memory_items
        SET friction_score = MAX(-10, MIN(10, friction_score + ?)),
            updated_at = datetime('now')
        WHERE id = ?
      `).run(delta, memoryId);
    });

    return id;
  }

  getFrictionEvents(memoryId: string): FrictionEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM friction_events
      WHERE memory_id = ?
      ORDER BY created_at DESC
    `).all(memoryId) as FrictionEventRow[];

    return rows.map((row) => ({
      id: row.id,
      memoryId: row.memory_id,
      eventType: row.event_type as FrictionEventType,
      delta: row.delta,
      context: row.context ?? undefined,
      createdAt: new Date(row.created_at),
    }));
  }

  // Half-life decay: score *= 0.5^(1/halfLifeDays) per call
  applyFrictionDecay(halfLifeDays: number = 30): number {
    const decayFactor = Math.pow(0.5, 1 / halfLifeDays);

    const result = this.db.prepare(`
      UPDATE memory_items
      SET friction_score = friction_score * ?,
          updated_at = datetime('now')
      WHERE friction_score != 0
    `).run(decayFactor);

    return result.changes;
  }

  startSession(): string {
    const id = nanoid();

    this.db.prepare(`
      INSERT INTO sessions (id) VALUES (?)
    `).run(id);

    return id;
  }

  endSession(sessionId: string): void {
    this.db.prepare(`
      UPDATE sessions SET ended_at = datetime('now')
      WHERE id = ?
    `).run(sessionId);
  }

  incrementSessionCounters(
    sessionId: string,
    promptIncrement: number = 0,
    memoryHitsIncrement: number = 0
  ): void {
    this.db.prepare(`
      UPDATE sessions
      SET prompt_count = prompt_count + ?,
          memory_hits = memory_hits + ?
      WHERE id = ?
    `).run(promptIncrement, memoryHitsIncrement, sessionId);
  }

  recordSessionMemory(
    sessionId: string,
    memoryId: string,
    relevanceScore: number
  ): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO session_memories (session_id, memory_id, relevance_score)
      VALUES (?, ?, ?)
    `).run(sessionId, memoryId, relevanceScore);
  }

  getSessionMemories(sessionId: string): Array<{ memory: MemoryItem; relevanceScore: number }> {
    const rows = this.db.prepare(`
      SELECT m.*, sm.relevance_score
      FROM memory_items m
      JOIN session_memories sm ON m.id = sm.memory_id
      WHERE sm.session_id = ?
    `).all(sessionId) as Array<MemoryRow & { relevance_score: number }>;

    return rows.map((row) => ({
      memory: this.rowToMemory(row),
      relevanceScore: row.relevance_score,
    }));
  }

  getStats(): MemoryStats {
    const counts = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type = 'constraint' THEN 1 ELSE 0 END) as constraints,
        SUM(CASE WHEN type = 'decision' THEN 1 ELSE 0 END) as decisions,
        SUM(CASE WHEN type = 'heuristic' THEN 1 ELSE 0 END) as heuristics,
        AVG(friction_score) as avg_friction,
        MIN(created_at) as oldest,
        MAX(created_at) as newest
      FROM memory_items
      WHERE active = 1
    `).get() as {
      total: number;
      constraints: number;
      decisions: number;
      heuristics: number;
      avg_friction: number | null;
      oldest: string | null;
      newest: string | null;
    };

    const frictionCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM friction_events
    `).get() as { count: number };

    return {
      totalMemories: counts.total,
      constraintCount: counts.constraints,
      decisionCount: counts.decisions,
      heuristicCount: counts.heuristics,
      totalFrictionEvents: frictionCount.count,
      averageFrictionScore: counts.avg_friction ?? 0,
      oldestMemory: counts.oldest ? new Date(counts.oldest) : undefined,
      newestMemory: counts.newest ? new Date(counts.newest) : undefined,
    };
  }

  listMemories(options: {
    type?: MemoryType;
    limit?: number;
    offset?: number;
    includeInactive?: boolean;
  } = {}): MemoryItem[] {
    const { type, limit = 50, offset = 0, includeInactive = false } = options;

    let sql = 'SELECT * FROM memory_items WHERE 1=1';
    const params: (string | number)[] = [];

    if (!includeInactive) {
      sql += ' AND active = 1';
    }

    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(sql).all(...params) as MemoryRow[];
    return rows.map((row) => this.rowToMemory(row));
  }

  private rowToMemory(row: MemoryRow): MemoryItem {
    const metadata = JSON.parse(row.metadata);
    const base = {
      id: row.id,
      content: row.content,
      context: row.context ?? undefined,
      source: row.source as MemorySource,
      frictionScore: row.friction_score,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      active: row.active === 1,
    };

    switch (row.type) {
      case 'constraint':
        return {
          ...base,
          type: 'constraint',
          scope: metadata.scope,
          severity: metadata.severity ?? 'warning',
        } as Constraint;

      case 'decision':
        return {
          ...base,
          type: 'decision',
          alternatives: metadata.alternatives,
          rationale: metadata.rationale ?? '',
          relatedFiles: metadata.relatedFiles,
        } as Decision;

      case 'heuristic':
        return {
          ...base,
          type: 'heuristic',
          applicableWhen: metadata.applicableWhen,
          strength: metadata.strength ?? 'moderate',
        } as Heuristic;

      default:
        throw new Error(`Unknown memory type: ${row.type}`);
    }
  }
}

// Database row types
interface MemoryRow {
  id: string;
  type: string;
  content: string;
  context: string | null;
  source: string;
  friction_score: number;
  created_at: string;
  updated_at: string;
  active: number;
  metadata: string;
}

interface FrictionEventRow {
  id: string;
  memory_id: string;
  event_type: string;
  delta: number;
  context: string | null;
  created_at: string;
}
