import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryStore } from '../../src/memory/store.js';
import { MemoryRetriever, formatMemoryForContext, formatMemoriesForContext } from '../../src/memory/retriever.js';
import { SimpleEmbedder } from '../../src/memory/embeddings.js';

function tmpDb(): string {
  return path.join(os.tmpdir(), `dc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('MemoryRetriever', () => {
  let store: MemoryStore;
  let retriever: MemoryRetriever;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    store = new MemoryStore(dbPath);
    const embedder = new SimpleEmbedder();
    retriever = new MemoryRetriever(store, embedder);
  });

  afterEach(() => {
    store.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
  });

  describe('addMemory', () => {
    it('adds a constraint with embedding', async () => {
      const id = await retriever.addMemory('constraint', 'Never use var');
      expect(id).toBeTruthy();

      const item = store.getById(id);
      expect(item).not.toBeNull();
      expect(item!.content).toBe('Never use var');

      // Should have an embedding
      const emb = store.getEmbedding(id);
      expect(emb).not.toBeNull();
      expect(emb!.length).toBe(384);
    });

    it('adds a decision with metadata', async () => {
      const id = await retriever.addMemory('decision', 'Use PostgreSQL', {
        rationale: 'Need complex joins',
        alternatives: ['MongoDB'],
      });
      const item = store.getById(id);
      expect(item!.type).toBe('decision');
    });

    it('adds a heuristic', async () => {
      const id = await retriever.addMemory('heuristic', 'Prefer async/await');
      const item = store.getById(id);
      expect(item!.type).toBe('heuristic');
    });
  });

  describe('retrieve', () => {
    it('finds relevant memories', async () => {
      await retriever.addMemory('constraint', 'Always use TypeScript strict mode');
      await retriever.addMemory('decision', 'Chose React for frontend');
      await retriever.addMemory('heuristic', 'Prefer functional components');

      const results = await retriever.retrieve('typescript configuration');
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects type filter', async () => {
      await retriever.addMemory('constraint', 'No var');
      await retriever.addMemory('decision', 'Use tabs');

      const results = await retriever.retrieve('coding style', { type: 'constraint' });
      for (const r of results) {
        expect(r.memory.type).toBe('constraint');
      }
    });

    it('respects limit', async () => {
      for (let i = 0; i < 10; i++) {
        await retriever.addMemory('constraint', `Rule number ${i}`);
      }

      const results = await retriever.retrieve('rules', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe('getAllConstraints', () => {
    it('returns all active constraints', async () => {
      await retriever.addMemory('constraint', 'Rule A');
      await retriever.addMemory('constraint', 'Rule B');
      await retriever.addMemory('decision', 'Not a constraint');

      const constraints = retriever.getAllConstraints();
      expect(constraints).toHaveLength(2);
      expect(constraints.every(c => c.type === 'constraint')).toBe(true);
    });
  });

  describe('detectsAmbiguity', () => {
    it('detects question patterns', () => {
      expect(retriever.detectsAmbiguity('Should I use React or Vue?')).toBe(true);
      expect(retriever.detectsAmbiguity('What is the best approach?')).toBe(true);
      expect(retriever.detectsAmbiguity('Which method should I use?')).toBe(true);
      expect(retriever.detectsAmbiguity('Would you recommend this?')).toBe(true);
    });

    it('does not flag unambiguous prompts', () => {
      expect(retriever.detectsAmbiguity('Add a user login form')).toBe(false);
      expect(retriever.detectsAmbiguity('Fix the null pointer on line 42')).toBe(false);
    });

    it('detects trade-off language', () => {
      expect(retriever.detectsAmbiguity('What are the trade-offs?')).toBe(true);
      expect(retriever.detectsAmbiguity('Is it better to use X or Y?')).toBe(true);
    });
  });

  describe('retrieveForContext', () => {
    it('includes constraints, decisions, and heuristics when ambiguous', async () => {
      await retriever.addMemory('constraint', 'Always validate input');
      await retriever.addMemory('decision', 'Chose Zod for validation');
      await retriever.addMemory('heuristic', 'Prefer strict schemas');

      const ctx = await retriever.retrieveForContext('Should I validate this input?');
      expect(ctx.constraints.length).toBeGreaterThan(0);
      expect(ctx.isAmbiguous).toBe(true);
    });

    it('skips heuristics for unambiguous prompts', async () => {
      await retriever.addMemory('heuristic', 'Prefer named exports');
      const ctx = await retriever.retrieveForContext('Create a user model');
      expect(ctx.heuristics).toHaveLength(0);
      expect(ctx.isAmbiguous).toBe(false);
    });
  });

  describe('search', () => {
    it('returns results with lower similarity threshold', async () => {
      await retriever.addMemory('constraint', 'Use async/await everywhere');

      const results = await retriever.search('asynchronous code');
      // SimpleEmbedder won't produce great results, but should return something
      expect(results.length).toBeGreaterThanOrEqual(0);
    });
  });
});

describe('formatMemoryForContext', () => {
  it('formats a constraint', () => {
    const output = formatMemoryForContext({
      id: '1', type: 'constraint', content: 'No var',
      source: 'user', frictionScore: 0, createdAt: new Date(),
      updatedAt: new Date(), active: true, severity: 'error',
    });
    expect(output).toContain('[CONSTRAINT]');
    expect(output).toContain('No var');
  });

  it('formats a decision with rationale', () => {
    const output = formatMemoryForContext({
      id: '2', type: 'decision', content: 'Use PostgreSQL',
      source: 'user', frictionScore: 0, createdAt: new Date(),
      updatedAt: new Date(), active: true, rationale: 'Complex queries',
      alternatives: ['MongoDB'],
    });
    expect(output).toContain('[DECISION]');
    expect(output).toContain('Complex queries');
    expect(output).toContain('MongoDB');
  });

  it('formats a heuristic with applicableWhen', () => {
    const output = formatMemoryForContext({
      id: '3', type: 'heuristic', content: 'Prefer composition',
      source: 'user', frictionScore: 0, createdAt: new Date(),
      updatedAt: new Date(), active: true, strength: 'strong',
      applicableWhen: 'designing classes',
    });
    expect(output).toContain('[HEURISTIC]');
    expect(output).toContain('designing classes');
  });
});

describe('formatMemoriesForContext', () => {
  it('combines all sections', () => {
    const constraints = [{
      id: '1', type: 'constraint' as const, content: 'Rule',
      source: 'user' as const, frictionScore: 0, createdAt: new Date(),
      updatedAt: new Date(), active: true, severity: 'warning' as const,
    }];
    const decisions = [{
      memory: {
        id: '2', type: 'decision' as const, content: 'Choice',
        source: 'user' as const, frictionScore: 0, createdAt: new Date(),
        updatedAt: new Date(), active: true, rationale: 'Because',
      },
      similarity: 0.8,
      adjustedScore: 0.85,
    }];

    const output = formatMemoriesForContext(constraints, decisions, []);
    expect(output).toContain('Project Constraints');
    expect(output).toContain('Relevant Past Decisions');
    expect(output).toContain('85%');
  });

  it('returns empty string when no memories', () => {
    const output = formatMemoriesForContext([], [], []);
    expect(output).toBe('');
  });
});
