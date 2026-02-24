import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryStore } from '../../src/memory/store.js';
import { MemoryRetriever } from '../../src/memory/retriever.js';
import { SimpleEmbedder } from '../../src/memory/embeddings.js';
import { ContextBuilder } from '../../src/core/context-builder.js';

function tmpDb(): string {
  return path.join(os.tmpdir(), `dc-perf-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

function cleanDb(dbPath: string) {
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
  }
}

describe('performance: store operations', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
    cleanDb(dbPath);
  });

  it('inserts 100 memories under 200ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      store.addConstraint({ content: `Rule number ${i}` });
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it('batch insert in transaction is faster than individual inserts', () => {
    // Individual inserts
    const startIndividual = performance.now();
    for (let i = 0; i < 50; i++) {
      store.addConstraint({ content: `Individual ${i}` });
    }
    const individualTime = performance.now() - startIndividual;

    // Transaction batch
    const startBatch = performance.now();
    store.transaction(() => {
      for (let i = 0; i < 50; i++) {
        store.addDecision({ content: `Batch ${i}`, rationale: 'perf test' });
      }
    });
    const batchTime = performance.now() - startBatch;

    expect(batchTime).toBeLessThan(individualTime);
  });

  it('retrieves by type from 500 items under 50ms', () => {
    store.transaction(() => {
      for (let i = 0; i < 250; i++) {
        store.addConstraint({ content: `Constraint ${i}` });
      }
      for (let i = 0; i < 250; i++) {
        store.addDecision({ content: `Decision ${i}`, rationale: 'test' });
      }
    });

    const start = performance.now();
    const results = store.getByType('constraint');
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(250);
    expect(elapsed).toBeLessThan(50);
  });

  it('vector search across 200 embedded items under 100ms', () => {
    const ids: string[] = [];
    store.transaction(() => {
      for (let i = 0; i < 200; i++) {
        ids.push(store.addConstraint({ content: `Vector item ${i}` }));
      }
    });

    // Set embeddings
    for (const id of ids) {
      const emb = new Float32Array(384);
      for (let j = 0; j < 384; j++) emb[j] = Math.random();
      store.setEmbedding(id, emb);
    }

    const query = new Float32Array(384);
    for (let j = 0; j < 384; j++) query[j] = Math.random();

    const start = performance.now();
    const results = store.vectorSearch(query, { limit: 10 });
    const elapsed = performance.now() - start;

    expect(results).toHaveLength(10);
    expect(elapsed).toBeLessThan(100);
  });

  it('soft delete + list is consistent under load', () => {
    const ids: string[] = [];
    store.transaction(() => {
      for (let i = 0; i < 100; i++) {
        ids.push(store.addConstraint({ content: `Deletable ${i}` }));
      }
    });

    // Delete every other item
    for (let i = 0; i < ids.length; i += 2) {
      store.delete(ids[i]);
    }

    const active = store.listMemories({ limit: 200 });
    const all = store.listMemories({ includeInactive: true, limit: 200 });

    expect(active).toHaveLength(50);
    expect(all).toHaveLength(100);
  });
});

describe('performance: embeddings', () => {
  it('SimpleEmbedder generates 100 embeddings under 50ms', async () => {
    const embedder = new SimpleEmbedder();
    const texts = Array.from({ length: 100 }, (_, i) => `This is test sentence number ${i}`);

    const start = performance.now();
    for (const text of texts) {
      await embedder.embed(text);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });

  it('batch embedding is available and works', async () => {
    const embedder = new SimpleEmbedder();
    const texts = ['alpha', 'beta', 'gamma', 'delta'];

    const results = await embedder.embedBatch(texts);
    expect(results).toHaveLength(4);
    for (const emb of results) {
      expect(emb.length).toBe(384);
    }
  });
});

describe('performance: retriever end-to-end', () => {
  let store: MemoryStore;
  let retriever: MemoryRetriever;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    store = new MemoryStore(dbPath);
    retriever = new MemoryRetriever(store, new SimpleEmbedder());
  });

  afterEach(() => {
    store.close();
    cleanDb(dbPath);
  });

  it('adding and retrieving 20 memories under 500ms', async () => {
    const start = performance.now();

    for (let i = 0; i < 10; i++) {
      await retriever.addMemory('constraint', `Rule ${i}: do thing ${i}`);
    }
    for (let i = 0; i < 10; i++) {
      await retriever.addMemory('decision', `Decided to use approach ${i}`);
    }

    const results = await retriever.retrieve('What rules apply?', { limit: 5 });
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });

  it('retrieveForContext returns structured output', async () => {
    await retriever.addMemory('constraint', 'Always validate input');
    await retriever.addMemory('decision', 'Use PostgreSQL for storage');
    await retriever.addMemory('heuristic', 'Prefer composition over inheritance');

    const ctx = await retriever.retrieveForContext('Build a new feature');

    expect(ctx.constraints.length).toBeGreaterThanOrEqual(1);
    expect(ctx.decisions.length).toBeGreaterThanOrEqual(0);
  });
});

describe('performance: context builder', () => {
  let store: MemoryStore;
  let builder: ContextBuilder;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    store = new MemoryStore(dbPath);
    const retriever = new MemoryRetriever(store, new SimpleEmbedder());
    builder = new ContextBuilder(retriever);
  });

  afterEach(() => {
    store.close();
    cleanDb(dbPath);
  });

  it('builds context under 200ms with empty store', async () => {
    const start = performance.now();
    const ctx = await builder.build('Write a function');
    const elapsed = performance.now() - start;

    expect(ctx.messages.length).toBeGreaterThanOrEqual(2);
    expect(elapsed).toBeLessThan(200);
  });

  it('token estimation scales linearly', async () => {
    const short = await builder.build('Hi');
    const long = await builder.build('A'.repeat(1000));

    expect(long.tokenEstimate).toBeGreaterThan(short.tokenEstimate);
  });
});
