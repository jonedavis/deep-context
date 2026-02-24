// Embedding dimension for all-MiniLM-L6-v2
export const LOCAL_EMBEDDING_DIM = 384;

// Embedding dimension for Ollama nomic-embed-text
export const OLLAMA_EMBEDDING_DIM = 768;

export interface Embedder {
  readonly dimensions: number;
  readonly name: string;
  initialize(): Promise<void>;
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

// Character-level hashing fallback — for testing only, not production.
export class SimpleEmbedder implements Embedder {
  readonly dimensions = LOCAL_EMBEDDING_DIM;
  readonly name = 'simple';

  async initialize(): Promise<void> {
    // No initialization needed
  }

  async embed(text: string): Promise<Float32Array> {
    return this.hashToEmbedding(text);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    return texts.map((text) => this.hashToEmbedding(text));
  }

  /**
   * Simple hash-based embedding for testing
   * Uses character codes and position to create a deterministic embedding
   */
  private hashToEmbedding(text: string): Float32Array {
    const embedding = new Float32Array(this.dimensions);
    const normalized = text.toLowerCase().trim();

    // Initialize with small random values based on text length
    for (let i = 0; i < this.dimensions; i++) {
      embedding[i] = Math.sin(i * 0.1 + normalized.length * 0.01) * 0.01;
    }

    // Accumulate character contributions
    for (let i = 0; i < normalized.length; i++) {
      const charCode = normalized.charCodeAt(i);
      const position = i % this.dimensions;

      // Multiple hash functions for better distribution
      embedding[position] += Math.sin(charCode * 0.1) * 0.1;
      embedding[(position + 1) % this.dimensions] += Math.cos(charCode * 0.1) * 0.1;
      embedding[(charCode % this.dimensions)] += 0.05;
    }

    // Word-level features
    const words = normalized.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const wordHash = this.simpleHash(word);
      const position = wordHash % this.dimensions;
      embedding[position] += 0.1;
    }

    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        embedding[i] /= norm;
      }
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export class OllamaEmbedder implements Embedder {
  readonly dimensions = OLLAMA_EMBEDDING_DIM;
  readonly name = 'ollama';

  constructor(
    private baseUrl: string = 'http://127.0.0.1:11434',
    private model: string = 'nomic-embed-text'
  ) {}

  async initialize(): Promise<void> {
    // Check if Ollama is available and model is pulled
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error('Ollama server not responding');
      }

      const data = await response.json() as { models: Array<{ name: string }> };
      const hasModel = data.models?.some((m) => m.name.includes(this.model));

      if (!hasModel) {
        console.warn(`Model ${this.model} not found. Pulling...`);
        await this.pullModel();
      }
    } catch (error) {
      throw new Error(`Failed to connect to Ollama at ${this.baseUrl}: ${error}`);
    }
  }

  private async pullModel(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.model }),
    });

    if (!response.ok) {
      throw new Error(`Failed to pull model ${this.model}`);
    }

    // Wait for pull to complete (streaming response)
    const reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch(`${this.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${error}`);
    }

    const data = await response.json() as { embeddings: number[][] };

    return data.embeddings.map((e) => new Float32Array(e));
  }
}

export class OpenAIEmbedder implements Embedder {
  readonly dimensions = 1536; // text-embedding-3-small
  readonly name = 'openai';

  constructor(
    private apiKey: string,
    private model: string = 'text-embedding-3-small'
  ) {}

  async initialize(): Promise<void> {
    try {
      await this.embed('test');
    } catch (error) {
      throw new Error(`OpenAI API key invalid: ${error}`);
    }
  }

  async embed(text: string): Promise<Float32Array> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI embedding failed: ${error}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    return sorted.map((d) => new Float32Array(d.embedding));
  }
}

export interface EmbedderConfig {
  provider: 'local' | 'simple' | 'ollama' | 'openai';
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

export async function createEmbedder(config: EmbedderConfig): Promise<Embedder> {
  let embedder: Embedder;

  switch (config.provider) {
    case 'simple':
      embedder = new SimpleEmbedder();
      break;

    case 'local':
      // For now, fall back to simple embedder
      // In production, this would use transformers.js
      console.warn('Local embeddings not yet implemented, using simple embedder');
      embedder = new SimpleEmbedder();
      break;

    case 'ollama':
      embedder = new OllamaEmbedder(
        config.ollamaUrl ?? 'http://127.0.0.1:11434',
        config.ollamaModel ?? 'nomic-embed-text'
      );
      break;

    case 'openai':
      if (!config.openaiApiKey) {
        throw new Error('OpenAI API key required for OpenAI embeddings');
      }
      embedder = new OpenAIEmbedder(
        config.openaiApiKey,
        config.openaiModel ?? 'text-embedding-3-small'
      );
      break;

    default:
      throw new Error(`Unknown embedder provider: ${config.provider}`);
  }

  await embedder.initialize();
  return embedder;
}
