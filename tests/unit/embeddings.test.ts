import { describe, it, expect } from 'vitest';
import { SimpleEmbedder, createEmbedder } from '../../src/memory/embeddings.js';

describe('SimpleEmbedder', () => {
  const embedder = new SimpleEmbedder();

  it('has correct dimension', () => {
    expect(embedder.dimensions).toBe(384);
    expect(embedder.name).toBe('simple');
  });

  it('produces 384-dimensional embeddings', async () => {
    const emb = await embedder.embed('hello world');
    expect(emb).toBeInstanceOf(Float32Array);
    expect(emb.length).toBe(384);
  });

  it('produces normalized vectors', async () => {
    const emb = await embedder.embed('test input');
    let norm = 0;
    for (let i = 0; i < emb.length; i++) {
      norm += emb[i] * emb[i];
    }
    norm = Math.sqrt(norm);
    expect(norm).toBeCloseTo(1.0, 1);
  });

  it('is deterministic', async () => {
    const a = await embedder.embed('same input');
    const b = await embedder.embed('same input');
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it('produces different embeddings for different text', async () => {
    const a = await embedder.embed('apples and oranges');
    const b = await embedder.embed('quantum physics theory');

    let same = true;
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i] - b[i]) > 0.001) {
        same = false;
        break;
      }
    }
    expect(same).toBe(false);
  });

  it('handles empty string without crashing', async () => {
    const emb = await embedder.embed('');
    expect(emb.length).toBe(384);
  });

  it('handles very long strings', async () => {
    const long = 'x'.repeat(10000);
    const emb = await embedder.embed(long);
    expect(emb.length).toBe(384);
  });

  it('batch embeds multiple texts', async () => {
    const results = await embedder.embedBatch(['hello', 'world', 'test']);
    expect(results).toHaveLength(3);
    for (const emb of results) {
      expect(emb.length).toBe(384);
    }
  });

  it('initialize is a no-op', async () => {
    await embedder.initialize();
    // No error means success
  });
});

describe('createEmbedder', () => {
  it('creates simple embedder', async () => {
    const embedder = await createEmbedder({ provider: 'simple' });
    expect(embedder.name).toBe('simple');
  });

  it('falls back to simple for local provider', async () => {
    const embedder = await createEmbedder({ provider: 'local' });
    expect(embedder.name).toBe('simple');
  });

  it('rejects unknown provider', async () => {
    await expect(createEmbedder({ provider: 'fake' as any })).rejects.toThrow();
  });

  it('rejects openai without API key', async () => {
    await expect(createEmbedder({ provider: 'openai' })).rejects.toThrow('API key');
  });
});
