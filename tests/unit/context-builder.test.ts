import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryStore } from '../../src/memory/store.js';
import { MemoryRetriever } from '../../src/memory/retriever.js';
import { SimpleEmbedder } from '../../src/memory/embeddings.js';
import { ContextBuilder, buildSimpleContext } from '../../src/core/context-builder.js';

function tmpDb(): string {
  return path.join(os.tmpdir(), `dc-ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
}

describe('ContextBuilder', () => {
  let store: MemoryStore;
  let retriever: MemoryRetriever;
  let builder: ContextBuilder;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tmpDb();
    store = new MemoryStore(dbPath);
    const embedder = new SimpleEmbedder();
    retriever = new MemoryRetriever(store, embedder);
    builder = new ContextBuilder(retriever);
  });

  afterEach(() => {
    store.close();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch { /* ignore */ }
    }
  });

  it('builds context with system message and user prompt', async () => {
    const ctx = await builder.build('Write a function');
    expect(ctx.messages.length).toBeGreaterThanOrEqual(2);
    expect(ctx.messages[0].role).toBe('system');
    expect(ctx.messages[ctx.messages.length - 1].role).toBe('user');
    expect(ctx.messages[ctx.messages.length - 1].content).toBe('Write a function');
  });

  it('includes memory stats', async () => {
    await retriever.addMemory('constraint', 'Use strict mode');

    const ctx = await builder.build('Configure TypeScript');
    expect(ctx.memoryStats.constraintsIncluded).toBeGreaterThanOrEqual(1);
  });

  it('skips memory when disabled', async () => {
    await retriever.addMemory('constraint', 'Some rule');

    const ctx = await builder.build('Anything', [], { includeMemory: false });
    expect(ctx.memoryStats.constraintsIncluded).toBe(0);
    expect(ctx.memoryStats.decisionsIncluded).toBe(0);
    expect(ctx.memoryStats.heuristicsIncluded).toBe(0);
  });

  it('includes conversation history', async () => {
    const history = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there' },
    ];

    const ctx = await builder.build('Follow up question', history);
    // system + history[0] + history[1] + user prompt
    expect(ctx.messages.length).toBe(4);
  });

  it('truncates long conversation history', async () => {
    // Create history that exceeds token budget
    const longHistory = [];
    for (let i = 0; i < 100; i++) {
      longHistory.push({
        role: 'user' as const,
        content: 'A'.repeat(500), // ~125 tokens each
      });
    }

    const ctx = await builder.build('Latest question', longHistory);
    // Should have fewer messages than the full history
    expect(ctx.messages.length).toBeLessThan(longHistory.length + 2);
  });

  it('estimates token count', async () => {
    const ctx = await builder.build('Short prompt');
    expect(ctx.tokenEstimate).toBeGreaterThan(0);
  });

  it('system prompt mentions constraints when present', async () => {
    await retriever.addMemory('constraint', 'Always use async/await');

    const ctx = await builder.build('Write a function');
    const system = ctx.messages.find(m => m.role === 'system');
    expect(system).toBeDefined();
    expect(system!.content).toContain('CONSTRAINT');
    expect(system!.content).toContain('async/await');
  });
});

describe('buildSimpleContext', () => {
  it('builds messages without memory', () => {
    const messages = buildSimpleContext('Hello');
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(messages[0].content).toBe('Hello');
  });

  it('includes system prompt when provided', () => {
    const messages = buildSimpleContext('Hello', [], 'You are helpful');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
  });

  it('includes conversation history', () => {
    const history = [
      { role: 'user' as const, content: 'Prior question' },
      { role: 'assistant' as const, content: 'Prior answer' },
    ];
    const messages = buildSimpleContext('New question', history);
    expect(messages).toHaveLength(3);
  });
});
