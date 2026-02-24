import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryStore } from '../../src/memory/store.js';

function tmpDb(): string {
  return path.join(os.tmpdir(), `dc-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('MemoryStore', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
  });

  describe('constraints', () => {
    it('adds and retrieves a constraint', () => {
      const id = store.addConstraint({ content: 'Use tabs', severity: 'error' });
      const item = store.getById(id);
      expect(item).not.toBeNull();
      expect(item!.type).toBe('constraint');
      expect(item!.content).toBe('Use tabs');
      expect((item as any).severity).toBe('error');
    });

    it('returns all constraints', () => {
      store.addConstraint({ content: 'Rule A' });
      store.addConstraint({ content: 'Rule B' });
      const all = store.getAllConstraints();
      expect(all).toHaveLength(2);
    });

    it('defaults severity to warning', () => {
      const id = store.addConstraint({ content: 'Soft rule' });
      const item = store.getById(id);
      expect((item as any).severity).toBe('warning');
    });
  });

  describe('decisions', () => {
    it('adds and retrieves a decision with rationale', () => {
      const id = store.addDecision({
        content: 'Use PostgreSQL',
        rationale: 'Complex queries needed',
        alternatives: ['MongoDB', 'MySQL'],
      });
      const item = store.getById(id);
      expect(item).not.toBeNull();
      expect(item!.type).toBe('decision');
      expect((item as any).rationale).toBe('Complex queries needed');
      expect((item as any).alternatives).toEqual(['MongoDB', 'MySQL']);
    });
  });

  describe('heuristics', () => {
    it('adds and retrieves a heuristic', () => {
      const id = store.addHeuristic({
        content: 'Prefer composition',
        strength: 'strong',
        applicableWhen: 'designing class hierarchies',
      });
      const item = store.getById(id);
      expect(item).not.toBeNull();
      expect(item!.type).toBe('heuristic');
      expect((item as any).strength).toBe('strong');
      expect((item as any).applicableWhen).toBe('designing class hierarchies');
    });

    it('defaults strength to moderate', () => {
      const id = store.addHeuristic({ content: 'Test pref' });
      const item = store.getById(id);
      expect((item as any).strength).toBe('moderate');
    });
  });

  describe('getByType', () => {
    it('filters by type', () => {
      store.addConstraint({ content: 'c1' });
      store.addDecision({ content: 'd1', rationale: '' });
      store.addHeuristic({ content: 'h1' });
      store.addConstraint({ content: 'c2' });

      expect(store.getByType('constraint')).toHaveLength(2);
      expect(store.getByType('decision')).toHaveLength(1);
      expect(store.getByType('heuristic')).toHaveLength(1);
    });
  });

  describe('soft delete', () => {
    it('hides deleted items from getById', () => {
      const id = store.addConstraint({ content: 'deleteme' });
      expect(store.delete(id)).toBe(true);
      expect(store.getById(id)).toBeNull();
    });

    it('hides deleted items from getByType', () => {
      store.addConstraint({ content: 'keep' });
      const toDelete = store.addConstraint({ content: 'remove' });
      store.delete(toDelete);
      expect(store.getByType('constraint')).toHaveLength(1);
    });

    it('returns false for nonexistent id', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('hard delete', () => {
    it('permanently removes the item', () => {
      const id = store.addConstraint({ content: 'gone' });
      expect(store.hardDelete(id)).toBe(true);
      // Even listing inactive won't find it
      expect(store.listMemories({ includeInactive: true })).toHaveLength(0);
    });
  });

  describe('updateContent', () => {
    it('updates the content of an active memory', () => {
      const id = store.addConstraint({ content: 'old text' });
      expect(store.updateContent(id, 'new text')).toBe(true);
      expect(store.getById(id)!.content).toBe('new text');
    });

    it('returns false for inactive memory', () => {
      const id = store.addConstraint({ content: 'text' });
      store.delete(id);
      expect(store.updateContent(id, 'updated')).toBe(false);
    });
  });

  describe('embeddings', () => {
    it('stores and retrieves embeddings', () => {
      const id = store.addConstraint({ content: 'test' });
      const embedding = new Float32Array(384);
      for (let i = 0; i < 384; i++) embedding[i] = Math.random();

      store.setEmbedding(id, embedding);
      const retrieved = store.getEmbedding(id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(384);
      for (let i = 0; i < 384; i++) {
        expect(retrieved![i]).toBeCloseTo(embedding[i], 5);
      }
    });

    it('rejects wrong dimension', () => {
      const id = store.addConstraint({ content: 'test' });
      const wrong = new Float32Array(100);
      expect(() => store.setEmbedding(id, wrong)).toThrow('dimension mismatch');
    });

    it('returns null for missing embedding', () => {
      const id = store.addConstraint({ content: 'test' });
      expect(store.getEmbedding(id)).toBeNull();
    });
  });

  describe('vectorSearch', () => {
    it('returns results sorted by similarity', () => {
      // Create two memories with different embeddings
      const id1 = store.addConstraint({ content: 'apples' });
      const id2 = store.addConstraint({ content: 'oranges' });

      const emb1 = new Float32Array(384).fill(0);
      emb1[0] = 1.0; // point along axis 0
      store.setEmbedding(id1, emb1);

      const emb2 = new Float32Array(384).fill(0);
      emb2[1] = 1.0; // point along axis 1
      store.setEmbedding(id2, emb2);

      // Query close to emb1
      const query = new Float32Array(384).fill(0);
      query[0] = 0.9;
      query[1] = 0.1;

      const results = store.vectorSearch(query, { limit: 10 });
      expect(results.length).toBe(2);
      expect(results[0].memory.content).toBe('apples');
      expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    });

    it('filters by type', () => {
      const id1 = store.addConstraint({ content: 'c' });
      const id2 = store.addDecision({ content: 'd', rationale: '' });

      const emb = new Float32Array(384).fill(0);
      emb[0] = 1.0;
      store.setEmbedding(id1, emb);
      store.setEmbedding(id2, emb);

      const results = store.vectorSearch(emb, { limit: 10, types: ['decision'] });
      expect(results.length).toBe(1);
      expect(results[0].memory.type).toBe('decision');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        const id = store.addConstraint({ content: `item ${i}` });
        const emb = new Float32Array(384).fill(0);
        emb[i] = 1.0;
        store.setEmbedding(id, emb);
      }

      const query = new Float32Array(384).fill(0.1);
      const results = store.vectorSearch(query, { limit: 2 });
      expect(results.length).toBe(2);
    });
  });

  describe('friction', () => {
    it('records friction events and updates score', () => {
      const id = store.addConstraint({ content: 'test' });

      store.recordFrictionEvent(id, 'correction', -1.0, 'wrong advice');
      const item = store.getById(id);
      expect(item!.frictionScore).toBe(-1.0);

      store.recordFrictionEvent(id, 'acceptance', 2.0);
      const updated = store.getById(id);
      expect(updated!.frictionScore).toBe(1.0);
    });

    it('clamps friction to [-10, 10]', () => {
      const id = store.addConstraint({ content: 'test' });
      // Push far positive
      for (let i = 0; i < 20; i++) {
        store.recordFrictionEvent(id, 'acceptance', 5.0);
      }
      expect(store.getById(id)!.frictionScore).toBeLessThanOrEqual(10);

      // Push far negative
      for (let i = 0; i < 50; i++) {
        store.recordFrictionEvent(id, 'correction', -5.0);
      }
      expect(store.getById(id)!.frictionScore).toBeGreaterThanOrEqual(-10);
    });

    it('getFrictionEvents returns all events for a memory', () => {
      const id = store.addConstraint({ content: 'test' });
      store.recordFrictionEvent(id, 'correction', -0.5, 'first');
      store.recordFrictionEvent(id, 'acceptance', 0.5, 'second');

      const events = store.getFrictionEvents(id);
      expect(events).toHaveLength(2);
      const contexts = events.map(e => e.context);
      expect(contexts).toContain('first');
      expect(contexts).toContain('second');
    });

    it('applies friction decay', () => {
      const id = store.addConstraint({ content: 'test' });
      store.recordFrictionEvent(id, 'acceptance', 5.0);

      const before = store.getById(id)!.frictionScore;
      store.applyFrictionDecay(30);
      const after = store.getById(id)!.frictionScore;

      expect(after).toBeLessThan(before);
      expect(after).toBeGreaterThan(0);
    });
  });

  describe('sessions', () => {
    it('starts and ends a session', () => {
      const sessionId = store.startSession();
      expect(sessionId).toBeTruthy();
      store.endSession(sessionId);
      // No throw means success
    });

    it('tracks session counters', () => {
      const sessionId = store.startSession();
      store.incrementSessionCounters(sessionId, 3, 2);
      // Just verify no errors - counters are internal
    });

    it('records and retrieves session memories', () => {
      const sessionId = store.startSession();
      const memId = store.addConstraint({ content: 'test' });

      store.recordSessionMemory(sessionId, memId, 0.85);
      const sessionMems = store.getSessionMemories(sessionId);
      expect(sessionMems).toHaveLength(1);
      expect(sessionMems[0].relevanceScore).toBeCloseTo(0.85);
      expect(sessionMems[0].memory.content).toBe('test');
    });
  });

  describe('stats', () => {
    it('reports correct counts', () => {
      store.addConstraint({ content: 'c1' });
      store.addConstraint({ content: 'c2' });
      store.addDecision({ content: 'd1', rationale: '' });
      store.addHeuristic({ content: 'h1' });

      const stats = store.getStats();
      expect(stats.totalMemories).toBe(4);
      expect(stats.constraintCount).toBe(2);
      expect(stats.decisionCount).toBe(1);
      expect(stats.heuristicCount).toBe(1);
    });

    it('returns zero for empty store', () => {
      const stats = store.getStats();
      expect(stats.totalMemories).toBe(0);
      expect(stats.averageFrictionScore).toBe(0);
    });
  });

  describe('listMemories', () => {
    it('paginates results', () => {
      for (let i = 0; i < 10; i++) {
        store.addConstraint({ content: `rule ${i}` });
      }

      const page1 = store.listMemories({ limit: 3, offset: 0 });
      const page2 = store.listMemories({ limit: 3, offset: 3 });
      expect(page1).toHaveLength(3);
      expect(page2).toHaveLength(3);
      // Different items
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('includes inactive when requested', () => {
      const id = store.addConstraint({ content: 'deleted' });
      store.delete(id);

      expect(store.listMemories()).toHaveLength(0);
      expect(store.listMemories({ includeInactive: true })).toHaveLength(1);
    });
  });

  describe('transaction', () => {
    it('commits on success', () => {
      store.transaction(() => {
        store.addConstraint({ content: 'inside txn' });
      });
      expect(store.getByType('constraint')).toHaveLength(1);
    });

    it('rolls back on error', () => {
      try {
        store.transaction(() => {
          store.addConstraint({ content: 'will rollback' });
          throw new Error('abort');
        });
      } catch { /* expected */ }
      expect(store.getByType('constraint')).toHaveLength(0);
    });
  });
});
