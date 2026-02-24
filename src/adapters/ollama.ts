/**
 * Ollama Model Adapter
 *
 * Connects to local Ollama server for completely offline AI.
 * Supports streaming responses.
 */

import type {
  ModelAdapter,
  CompletionRequest,
  CompletionResponse,
  ModelInfo,
  OllamaConfig,
  Message,
} from './types.js';

// Context limits for common models (conservative estimates)
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'llama3.2': 128000,
  'llama3.1': 128000,
  'llama3': 8192,
  'llama2': 4096,
  'codellama': 16384,
  'mistral': 32768,
  'mixtral': 32768,
  'deepseek-coder': 16384,
  'qwen2.5-coder': 32768,
  'phi3': 128000,
  'gemma2': 8192,
};

export class OllamaAdapter implements ModelAdapter {
  readonly name: string;
  readonly provider = 'ollama';
  readonly supportsStreaming = true;

  private baseUrl: string;
  private model: string;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.model = config.model;
    this.name = `ollama:${config.model}`;
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(request.messages),
        stream: false,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 4096,
          stop: request.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}`);
    }

    const data = await response.json() as OllamaChatResponse;

    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? 'stop' : 'length',
    };
  }

  async *streamComplete(request: CompletionRequest): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        messages: this.formatMessages(request.messages),
        stream: true,
        options: {
          temperature: request.temperature ?? 0.7,
          num_predict: request.maxTokens ?? 4096,
          stop: request.stopSequences,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama error: ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const data = JSON.parse(line) as OllamaStreamChunk;
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer) as OllamaStreamChunk;
          if (data.message?.content) {
            yield data.message.content;
          }
        } catch {
          // Skip invalid JSON
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);

    if (!response.ok) {
      throw new Error('Failed to list Ollama models');
    }

    const data = await response.json() as { models: OllamaModel[] };

    return data.models.map((model) => ({
      id: model.name,
      name: model.name.split(':')[0],
      contextLength: this.getContextLimitForModel(model.name),
      description: `${(model.size / 1e9).toFixed(1)}GB`,
    }));
  }

  getContextLimit(): number {
    return this.getContextLimitForModel(this.model);
  }

  private getContextLimitForModel(model: string): number {
    const baseName = model.split(':')[0].toLowerCase();

    // Check exact match first
    if (MODEL_CONTEXT_LIMITS[baseName]) {
      return MODEL_CONTEXT_LIMITS[baseName];
    }

    // Check prefix matches
    for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
      if (baseName.startsWith(key)) {
        return limit;
      }
    }

    // Default conservative estimate
    return 8192;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private formatMessages(messages: Message[]): OllamaMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }
}

// Ollama API types
interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

interface OllamaStreamChunk {
  model: string;
  message: OllamaMessage;
  done: boolean;
}

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}
